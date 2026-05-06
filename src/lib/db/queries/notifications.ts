import { db } from "../index";
import {
  notifications,
  pushSubscriptions,
  snoozedPushes,
  tasks,
  users,
  userSettings,
} from "../schema";
import { eq, and, desc, ne, lt, lte, isNull, sql } from "drizzle-orm";
import type { CrisisDetectionTier, NotificationPrefs, PersonalityPrefs } from "@/types";

// ============================================================
// Push Subscriptions
// ============================================================

export async function createPushSubscription(
  userId: string,
  endpoint: string,
  keysP256dh: string,
  keysAuth: string
) {
  const [sub] = await db
    .insert(pushSubscriptions)
    .values({ userId, endpoint, keysP256dh, keysAuth })
    .onConflictDoUpdate({
      target: [pushSubscriptions.userId, pushSubscriptions.endpoint],
      set: { keysP256dh, keysAuth },
    })
    .returning();

  // Prune stale endpoints for the same user. iOS PWAs rotate push endpoints
  // without invalidating the old one, which silently produces duplicate
  // deliveries. Any sibling row older than 14 days is safe to drop — a real
  // active device re-subscribes far more often than that.
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  await db
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.userId, userId),
        ne(pushSubscriptions.endpoint, endpoint),
        lt(pushSubscriptions.createdAt, cutoff)
      )
    );

  return sub;
}

export async function deletePushSubscription(userId: string, endpoint: string) {
  const [deleted] = await db
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.userId, userId),
        eq(pushSubscriptions.endpoint, endpoint)
      )
    )
    .returning();
  return deleted;
}

export async function getPushSubscriptions(userId: string) {
  return db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));
}

// ============================================================
// Notifications
// ============================================================

export async function createNotification(
  userId: string,
  type: string,
  content: Record<string, unknown>
) {
  const [notif] = await db
    .insert(notifications)
    .values({ userId, type, content, sentAt: new Date() })
    .returning();
  return notif;
}

export async function markNotificationOpened(
  notificationId: string,
  userId: string
) {
  const [updated] = await db
    .update(notifications)
    .set({ openedAt: new Date() })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.userId, userId)
      )
    )
    .returning();
  return updated;
}

export async function markAllNotificationsOpened(userId: string) {
  await db
    .update(notifications)
    .set({ openedAt: new Date() })
    .where(
      and(eq(notifications.userId, userId), isNull(notifications.openedAt))
    );
}

export async function getRecentNotifications(userId: string, limit = 50) {
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

/**
 * Returns the most recent completedAt timestamp for a user's tasks.
 * Returns null if the user has never completed a task.
 */
export async function getLastTaskCompletion(userId: string): Promise<Date | null> {
  const [result] = await db
    .select({ completedAt: tasks.completedAt })
    .from(tasks)
    .where(and(eq(tasks.userId, userId), eq(tasks.status, "completed"), isNull(tasks.deletedAt)))
    .orderBy(desc(tasks.completedAt))
    .limit(1);

  return result?.completedAt ?? null;
}

export async function getUnreadNotificationCount(userId: string) {
  const result = await db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        isNull(notifications.openedAt)
      )
    );
  return result.length;
}

/**
 * Get all users who have at least one active push subscription.
 * Returns userId, timezone, and prefs for cron trigger processing.
 */
export async function getAllUsersWithPushEnabled() {
  const rows = await db
    .selectDistinctOn([pushSubscriptions.userId], {
      userId: pushSubscriptions.userId,
      timezone: users.timezone,
      personalityPrefs: userSettings.personalityPrefs,
      notificationPrefs: userSettings.notificationPrefs,
      crisisDetectionTier: userSettings.crisisDetectionTier,
    })
    .from(pushSubscriptions)
    .innerJoin(users, eq(pushSubscriptions.userId, users.id))
    .leftJoin(userSettings, eq(userSettings.userId, users.id));

  return rows.map((r) => ({
    userId: r.userId,
    timezone: r.timezone ?? "America/New_York",
    personalityPrefs: r.personalityPrefs as PersonalityPrefs | null,
    notificationPrefs: r.notificationPrefs as NotificationPrefs | null,
    crisisDetectionTier: (r.crisisDetectionTier as CrisisDetectionTier) ?? "nudge",
  }));
}

/**
 * Get all users with any non-null notification prefs.
 * Returns userId, timezone, email, and their prefs.
 * Callers must gate on the specific flag they care about (e.g.
 * emailMorningDigest, emailEveningDigest) — this function does NOT
 * filter on any digest flag.
 */
export async function getAllUsersWithNotificationPrefs() {
  const rows = await db
    .select({
      userId: userSettings.userId,
      timezone: users.timezone,
      email: users.email,
      notificationPrefs: userSettings.notificationPrefs,
    })
    .from(userSettings)
    .innerJoin(users, eq(userSettings.userId, users.id))
    .where(sql`${userSettings.notificationPrefs} IS NOT NULL`);

  return rows.map((r) => ({
    userId: r.userId,
    timezone: r.timezone ?? "America/New_York",
    email: r.email,
    prefs: r.notificationPrefs as NotificationPrefs | null,
  }));
}

/**
 * Get all users who have Canvas iCal configured.
 */
export async function getAllUsersWithCalendars() {
  const rows = await db
    .select({
      userId: userSettings.userId,
      canvasIcalUrl: userSettings.canvasIcalUrl,
      timezone: users.timezone,
    })
    .from(userSettings)
    .innerJoin(users, eq(users.id, userSettings.userId))
    .where(sql`${userSettings.canvasIcalUrl} IS NOT NULL`);

  return rows;
}



// ============================================================
// Snoozed Pushes
// ============================================================

export async function createSnoozedPush(
  userId: string,
  payload: { title: string; body: string; url?: string; tag?: string },
  sendAfter: Date
) {
  await db.insert(snoozedPushes).values({ userId, payload, sendAfter });
}

/** Returns all snoozed pushes whose sendAfter has passed and haven't been sent yet. */
export async function getPendingSnoozedPushes() {
  const now = new Date();
  return db
    .select()
    .from(snoozedPushes)
    .where(and(isNull(snoozedPushes.sentAt), lte(snoozedPushes.sendAfter, now)));
}

export async function markSnoozedPushSent(id: string) {
  await db
    .update(snoozedPushes)
    .set({ sentAt: new Date() })
    .where(eq(snoozedPushes.id, id));
}



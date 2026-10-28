import { db } from "../index";
import {
  notifications,
  pushReceipts,
  pushSubscriptions,
  snoozedPushes,
  tasks,
  users,
  userSettings,
} from "../schema";
import { eq, and, desc, ne, lt, lte, isNull, notInArray, sql } from "drizzle-orm";
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
  content: Record<string, unknown>,
  /** Set when the id was already handed out (a push's receipt token). */
  id?: string
) {
  const [notif] = await db
    .insert(notifications)
    .values({ id, userId, type, content, sentAt: new Date() })
    .returning();
  return notif;
}

/** A device reported receiving a push. A repeat report keeps the first time. */
export async function recordPushReceipt(receipt: {
  userId: string;
  notificationId: string;
  subscriptionId: string;
  userAgent: string | null;
}) {
  await db.insert(pushReceipts).values(receipt).onConflictDoNothing();
}

/**
 * Internal bookkeeping rows that share the notifications table but were never
 * shown to anyone: "push_dropped" (triggers.ts DROPPED_ALERT_TYPE) and
 * "digest_draft" (send-email.ts). The bell and unread count leave them out.
 */
const HIDDEN_NOTIFICATION_TYPES = ["push_dropped", "digest_draft"];

/** Today's draft row for one digest, found by the key send-email.ts wrote. */
export async function getDigestDraft(userId: string, draftKey: string) {
  const [row] = await db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.type, "digest_draft"),
        sql`${notifications.content}->>'draftKey' = ${draftKey}`
      )
    )
    .orderBy(desc(notifications.createdAt))
    .limit(1);
  return row ?? null;
}

export async function updateNotificationContent(
  notificationId: string,
  userId: string,
  content: Record<string, unknown>
) {
  await db
    .update(notifications)
    .set({ content })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.userId, userId)
      )
    );
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

/**
 * Recent notification rows. `visibleOnly` leaves out the internal
 * HIDDEN_NOTIFICATION_TYPES rows — the bell wants that; the dedup helpers
 * need the "push_dropped" ones included.
 */
export async function getRecentNotifications(
  userId: string,
  limit = 50,
  { visibleOnly = false }: { visibleOnly?: boolean } = {}
) {
  return db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        visibleOnly ? notInArray(notifications.type, HIDDEN_NOTIFICATION_TYPES) : undefined
      )
    )
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
        isNull(notifications.openedAt),
        notInArray(notifications.type, HIDDEN_NOTIFICATION_TYPES)
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

/** One user's push config, the same shape as getAllUsersWithPushEnabled. */
export async function getPushUser(userId: string) {
  const [row] = await db
    .select({
      userId: pushSubscriptions.userId,
      timezone: users.timezone,
      personalityPrefs: userSettings.personalityPrefs,
      notificationPrefs: userSettings.notificationPrefs,
      crisisDetectionTier: userSettings.crisisDetectionTier,
    })
    .from(pushSubscriptions)
    .innerJoin(users, eq(pushSubscriptions.userId, users.id))
    .leftJoin(userSettings, eq(userSettings.userId, users.id))
    .where(eq(pushSubscriptions.userId, userId))
    .limit(1);
  if (!row) return null;
  return {
    userId: row.userId,
    timezone: row.timezone ?? "America/New_York",
    personalityPrefs: row.personalityPrefs as PersonalityPrefs | null,
    notificationPrefs: row.notificationPrefs as NotificationPrefs | null,
    crisisDetectionTier: (row.crisisDetectionTier as CrisisDetectionTier) ?? "nudge",
  };
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
      autoAddCanvasTasks: userSettings.autoAddCanvasTasks,
      canvasSelectedCourses: userSettings.canvasSelectedCourses,
      canvasAuthFailedAt: userSettings.canvasAuthFailedAt,
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

/**
 * payload is { taskId, tag } — the copy is rebuilt from the task when it
 * fires. Rows queued before v2.70.6 carry { title, body, url, tag } instead.
 */
export type SnoozedPushPayload =
  | { taskId: string; tag?: string }
  | { title: string; body: string; url?: string; tag?: string };

export async function createSnoozedPush(
  userId: string,
  payload: SnoozedPushPayload,
  sendAfter: Date
) {
  await db.insert(snoozedPushes).values({ userId, payload, sendAfter });
}

/**
 * Snoozed pushes whose sendAfter has passed and haven't been sent yet, each
 * with its task's current state (null for legacy rows or a vanished task).
 */
export async function getPendingSnoozedPushes() {
  const now = new Date();
  return db
    .select({
      id: snoozedPushes.id,
      userId: snoozedPushes.userId,
      payload: snoozedPushes.payload,
      sendAfter: snoozedPushes.sendAfter,
      taskTitle: tasks.title,
      taskStatus: tasks.status,
      taskDeletedAt: tasks.deletedAt,
    })
    .from(snoozedPushes)
    .leftJoin(
      tasks,
      and(
        sql`${tasks.id}::text = ${snoozedPushes.payload}->>'taskId'`,
        eq(tasks.userId, snoozedPushes.userId)
      )
    )
    .where(and(isNull(snoozedPushes.sentAt), lte(snoozedPushes.sendAfter, now)));
}

/** Drop a snoozed push that will never be sent (expired, or its task is done). */
export async function deleteSnoozedPush(id: string) {
  await db.delete(snoozedPushes).where(eq(snoozedPushes.id, id));
}

export async function markSnoozedPushSent(id: string) {
  await db
    .update(snoozedPushes)
    .set({ sentAt: new Date() })
    .where(eq(snoozedPushes.id, id));
}



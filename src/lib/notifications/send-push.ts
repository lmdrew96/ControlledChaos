import webpush from "@/lib/notifications/webpush-client";
import {
  getPushSubscriptions,
  getUserSettings,
  getUser,
  createNotification,
  deletePushSubscription,
} from "@/lib/db/queries";
import type { NotificationPrefs } from "@/types";

export interface PushAction {
  action: string;
  title: string;
}

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  bypassQuietHours?: boolean;
  /** Passed into notification data so the SW can deep-link to the specific task. */
  taskId?: string;
  /** Passed into notification data so the SW can call the snooze endpoint without an auth session. */
  userId?: string;
  /** The recipient's userId — used by nudge_back so the SW knows who is sending the return nudge. */
  recipientUserId?: string;
  /** Medication ID — used by the SW med_taken action to log the dose. */
  medicationId?: string;
  /** Multiple medication IDs — used by the SW med_taken action when bundling
   *  several meds scheduled at the same time slot into one notification. */
  medicationIds?: string[];
  /** Scheduled time slot (HH:MM) — used alongside medicationId for logging. */
  scheduledTime?: string;
  /** Action buttons shown on the notification (Android Chrome / desktop Chrome). */
  actions?: PushAction[];
}

/**
 * Check if the current time falls within quiet hours for a user.
 */
function isQuietHours(prefs: NotificationPrefs, timezone: string): boolean {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const currentTime = formatter.format(now); // "HH:MM"
  const start = prefs.quietHoursStart; // "22:00"
  const end = prefs.quietHoursEnd; // "07:00"

  if (start <= end) {
    // Same-day range (e.g., 09:00-17:00)
    return currentTime >= start && currentTime < end;
  } else {
    // Overnight range (e.g., 22:00-07:00)
    return currentTime >= start || currentTime < end;
  }
}

/**
 * Send a push notification to all of a user's subscribed devices.
 * Respects quiet hours. Logs to the notifications table.
 * Returns true if at least one push was sent.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload
): Promise<boolean> {
  const [subscriptions, settings, user] = await Promise.all([
    getPushSubscriptions(userId),
    getUserSettings(userId),
    getUser(userId),
  ]);

  if (subscriptions.length === 0) return false;

  // Check push enabled + quiet hours
  const prefs = settings?.notificationPrefs as NotificationPrefs | null;
  const timezone = user?.timezone ?? "America/New_York";

  if (!payload.bypassQuietHours) {
    if (prefs && !prefs.pushEnabled) {
      return false;
    }

    if (prefs && isQuietHours(prefs, timezone)) {
      return false;
    }
  }

  const pushPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? "/dashboard",
    tag: payload.tag ?? "cc-notification",
    taskId: payload.taskId,
    userId: payload.userId,
    recipientUserId: payload.recipientUserId,
    medicationId: payload.medicationId,
    medicationIds: payload.medicationIds,
    scheduledTime: payload.scheduledTime,
    actions: payload.actions ?? [],
  });

  let sent = false;

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.keysP256dh,
            auth: sub.keysAuth,
          },
        },
        pushPayload
      );
      sent = true;
    } catch (err: unknown) {
      const e = err as { statusCode?: number; body?: string; message?: string };
      if (e.statusCode === 410 || e.statusCode === 404) {
        // Subscription expired — clean up
        await deletePushSubscription(userId, sub.endpoint);
        console.log(`[Push] Removed expired subscription for ${userId}`);
      } else {
        console.error(`[Push] Failed to send to ${userId}: status=${e.statusCode} body=${e.body} msg=${e.message}`);
      }
    }
  }

  // Log the notification
  if (sent) {
    await createNotification(userId, "push", {
      title: payload.title,
      body: payload.body,
      url: payload.url,
      tag: payload.tag,
      dedupKey: payload.tag,
    });
  }

  return sent;
}

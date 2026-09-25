import { getWebPush } from "@/lib/notifications/webpush-client";
import {
  getPushSubscriptions,
  getUserSettings,
  getUser,
  createNotification,
  deletePushSubscription,
} from "@/lib/db/queries";
import type { NotificationPrefs } from "@/types";
import { isQuietHours } from "./quiet-hours";
import { mintSnoozeToken } from "./snooze-token";

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
  /** Action buttons shown on the notification (Android Chrome / desktop Chrome). */
  actions?: PushAction[];
  /**
   * Every dedup key this push accounts for. A clustered push speaks for
   * several alerts at once, and all of them must be suppressed on later ticks
   * — not just the one whose key became the tag. Defaults to [tag].
   */
  dedupKeys?: string[];
  /**
   * "user" = something the user asked for (configured reminders, planned
   * starts, check-in, snoozes). "app" = the app's own initiative (nudges,
   * missed-session follow-ups, crisis). Only "app" counts toward the daily
   * cap; see getAppPushesSentToday. Defaults to "user".
   */
  lane?: "user" | "app";
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

  // "Push off" is absolute. It used to sit inside the quiet-hours check, so
  // anything that bypassed quiet hours ("leave now") also bypassed the
  // user turning push off entirely.
  if (prefs && !prefs.pushEnabled) {
    return false;
  }

  // Quiet hours are the recipient's own window, in the recipient's timezone.
  if (!payload.bypassQuietHours && prefs && isQuietHours(prefs, timezone)) {
    return false;
  }

  // Snooze needs a task to bring back and a signed token the SW can present
  // without a session. No task → no Snooze button.
  let actions = payload.actions ?? [];
  let snoozeToken: string | undefined;
  if (actions.some((a) => a.action === "snooze")) {
    if (payload.taskId) {
      snoozeToken = mintSnoozeToken({ userId, taskId: payload.taskId, tag: payload.tag });
    } else {
      actions = actions.filter((a) => a.action !== "snooze");
    }
  }

  const pushPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? "/dashboard",
    tag: payload.tag ?? "cc-notification",
    taskId: payload.taskId,
    snoozeToken,
    actions,
  });

  let sent = false;
  const webpush = getWebPush();

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
        // Subscription rotated/expired — prune the dead endpoint so the cron
        // stops spraying a corpse. The client (pushsubscriptionchange + the
        // PushAutoHeal app-load reconcile) re-subscribes a fresh one. Logged
        // with a stable "[Push] prune" prefix so rotation frequency is greppable
        // in Vercel logs (feeds the "notifications table fate" patch).
        await deletePushSubscription(userId, sub.endpoint);
        console.warn(
          `[Push] prune: removed dead subscription status=${e.statusCode} userId=${userId} endpoint=${sub.endpoint}`
        );
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
      dedupKeys: payload.dedupKeys ?? (payload.tag ? [payload.tag] : []),
      lane: payload.lane ?? "user",
    });
  }

  return sent;
}

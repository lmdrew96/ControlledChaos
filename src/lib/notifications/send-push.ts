import webpush from "web-push";
import {
  getPushSubscriptions,
  getUserSettings,
  getUser,
  createNotification,
  deletePushSubscription,
} from "@/lib/db/queries";
import type { NotificationPrefs } from "@/types";

// Configure VAPID keys
if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:noreply@controlledchaos.app",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
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

  // Check quiet hours
  const prefs = settings?.notificationPrefs as NotificationPrefs | null;
  const timezone = user?.timezone ?? "America/New_York";

  if (prefs && isQuietHours(prefs, timezone)) {
    return false;
  }

  const pushPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? "/dashboard",
    tag: payload.tag ?? "cc-notification",
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
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 410 || statusCode === 404) {
        // Subscription expired — clean up
        await deletePushSubscription(userId, sub.endpoint);
        console.log(`[Push] Removed expired subscription for ${userId}`);
      } else {
        console.error(`[Push] Failed to send to ${userId}:`, err);
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

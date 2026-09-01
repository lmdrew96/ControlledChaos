import type { NotificationPrefs } from "@/types";

/**
 * Check if the current time falls within quiet hours for a user.
 * Exported so the cron layer can gate AI generation before calling sendPushToUser.
 */
export function isQuietHours(
  prefs: NotificationPrefs,
  timezone: string,
  /** Injectable for tests. Defaults to the real clock. */
  now: Date = new Date()
): boolean {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    // hourCycle "h23" rather than hour12:false — the latter can render midnight
    // as "24:00" under some ICU builds, which would break the "HH:MM" string
    // comparisons below on a same-day window.
    hourCycle: "h23",
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

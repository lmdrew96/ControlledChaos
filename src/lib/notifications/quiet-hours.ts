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

const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/**
 * Minutes since the user's quiet hours most recently ended, or null while
 * quiet hours are active (or when the window is empty, start === end).
 *
 * The push cron uses this to send ONE wake-up summary instead of letting
 * everything that became eligible overnight drip out a push per tick.
 */
export function minutesSinceQuietHoursEnded(
  prefs: NotificationPrefs,
  timezone: string,
  now: Date = new Date()
): number | null {
  if (prefs.quietHoursStart === prefs.quietHoursEnd) return null;
  if (isQuietHours(prefs, timezone, now)) return null;

  const current = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);

  return (toMinutes(current) - toMinutes(prefs.quietHoursEnd) + 1440) % 1440;
}

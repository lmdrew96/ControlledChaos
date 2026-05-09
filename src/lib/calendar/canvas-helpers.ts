import { toUTC } from "@/lib/timezone";

/**
 * Rewrite an all-day date to 23:59:00 in the user's local timezone.
 * Canvas assignments default to "due at 11:59 PM" — iCal encodes this as a
 * VALUE=DATE (all-day) entry, losing the time. node-ical parses VALUE=DATE
 * to midnight UTC of that calendar day, so we read the date from UTC parts
 * (not the user's tz, which would shift westward into the previous day) and
 * rebuild 23:59 in the user's local time.
 */
export function toEndOfDayLocal(date: Date, timezone: string): Date {
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return new Date(toUTC(`${year}-${month}-${day}T23:59:00`, timezone));
}

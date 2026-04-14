/**
 * Shared timezone utilities for ControlledChaos.
 *
 * All dates in the database are stored as UTC timestamps. The user's IANA
 * timezone string (e.g. "America/New_York") is stored in the users table.
 * These helpers handle every conversion between UTC and the user's local time
 * using the native Intl API — no date libraries needed.
 */

// ---------------------------------------------------------------------------
// Display format presets
// ---------------------------------------------------------------------------

export const DISPLAY_DATE: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
};

export const DISPLAY_TIME: Intl.DateTimeFormatOptions = {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
};

export const DISPLAY_DATETIME: Intl.DateTimeFormatOptions = {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
};

export const DISPLAY_FULL_DATETIME: Intl.DateTimeFormatOptions = {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
};

// ---------------------------------------------------------------------------
// Core primitives
// ---------------------------------------------------------------------------

/**
 * Compute the UTC offset (in milliseconds) for a timezone at a given instant.
 *
 * Positive = west of UTC (e.g. America/New_York EDT → +14_400_000).
 * Negative = east of UTC (e.g. Asia/Kolkata → -19_800_000).
 *
 * Uses the toLocaleString round-trip: render the same instant in both UTC and
 * the target timezone, parse both back to ms, and diff.
 */
export function getTimezoneOffsetMs(date: Date, timezone: string): number {
  const utcRepr = date.toLocaleString("en-US", { timeZone: "UTC" });
  const tzRepr = date.toLocaleString("en-US", { timeZone: timezone });
  return new Date(utcRepr).getTime() - new Date(tzRepr).getTime();
}

/**
 * Return zero-padded { year, month, day } strings for the given Date in the
 * given timezone.
 */
export function getCalendarParts(
  date: Date,
  timezone: string
): { year: string; month: string; day: string } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  return {
    year: parts.find((p) => p.type === "year")!.value,
    month: parts.find((p) => p.type === "month")!.value,
    day: parts.find((p) => p.type === "day")!.value,
  };
}

/**
 * Return the current hour (0-23) for a Date in the given timezone.
 */
export function getHourInTimezone(date: Date, timezone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    hour12: false,
  });
  return parseInt(formatter.format(date), 10) % 24;
}

// ---------------------------------------------------------------------------
// Day / week boundaries
// ---------------------------------------------------------------------------

/**
 * Return a Date representing midnight (00:00:00) of the given date's calendar
 * day in the specified timezone, expressed as a UTC timestamp.
 *
 * Example: for "America/New_York" (UTC-4 during EDT), if the user's local
 * date is April 14, this returns `2026-04-14T04:00:00Z`.
 */
export function startOfDayInTimezone(date: Date, timezone: string): Date {
  const { year, month, day } = getCalendarParts(date, timezone);
  const utcMidnight = new Date(`${year}-${month}-${day}T00:00:00Z`);
  const offsetMs = getTimezoneOffsetMs(utcMidnight, timezone);
  return new Date(utcMidnight.getTime() + offsetMs);
}

/**
 * Return the user's current date as "YYYY-MM-DD" in their timezone.
 */
export function todayInTimezone(timezone: string): string {
  const { year, month, day } = getCalendarParts(new Date(), timezone);
  return `${year}-${month}-${day}`;
}

/**
 * Return start of the current ISO week (Monday 00:00:00) in the user's
 * timezone, expressed as a UTC timestamp.
 */
export function startOfWeekInTimezone(timezone: string): Date {
  const now = new Date();
  const today = startOfDayInTimezone(now, timezone);

  const dowFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  });
  const dayName = dowFormatter.format(now);
  const dayMap: Record<string, number> = {
    Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6,
  };
  const mondayOffset = dayMap[dayName] ?? 0;

  return new Date(today.getTime() - mondayOffset * 24 * 60 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// UTC ↔ local conversions
// ---------------------------------------------------------------------------

/**
 * Convert a naive ISO string (representing local clock time in the user's
 * timezone) to a UTC ISO string.
 *
 * The AI outputs dates like "2026-04-14T09:00:00" or "2026-04-14T09:00:00Z"
 * but always means the user's local time. This function strips any timezone
 * suffix and converts to the correct UTC instant.
 */
export function toUTC(localIso: string, timezone: string): string {
  if (!localIso) return "";

  // Strip any timezone suffix (Z, +HH:MM, -HH:MM) — treat as local clock time
  const naive = localIso.replace(/Z$|[+-]\d{2}:\d{2}$/, "");

  const [datePart, timePart = "00:00:00"] = naive.split("T");
  if (!datePart || !/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return localIso;

  const [year, month, day] = datePart.split("-").map(Number);
  const timeParts = timePart.split(":").map((s) => parseInt(s, 10));
  const hours = timeParts[0] ?? 0;
  const minutes = timeParts[1] ?? 0;
  const seconds = timeParts[2] ?? 0;

  // Treat the naive values as UTC to create a reference Date
  const approxUtc = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));

  // Decompose approxUtc into what it looks like in the target timezone
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(approxUtc);

  const get = (type: string) =>
    parseInt(parts.find((p) => p.type === type)!.value, 10);

  const localHour = get("hour") % 24; // hour12:false can give 24 for midnight
  const localMin = get("minute");
  const localSec = get("second");
  const localYear = get("year");
  const localMon = get("month");
  const localDay = get("day");

  // offset_ms = approxUtc - (what approxUtc looks like in local time, treated as UTC ms)
  const localAsUtcMs = Date.UTC(localYear, localMon - 1, localDay, localHour, localMin, localSec);
  const offsetMs = approxUtc.getTime() - localAsUtcMs;

  // The correct UTC time = what the user said (as naive UTC ms) + the offset
  const wantedLocalMs = Date.UTC(year, month - 1, day, hours, minutes, seconds);
  return new Date(wantedLocalMs + offsetMs).toISOString();
}

/**
 * Decompose a UTC Date into calendar fields in the user's timezone.
 */
export function toUserLocal(
  date: Date,
  timezone: string
): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) =>
    parseInt(parts.find((p) => p.type === type)!.value, 10);

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") % 24,
    minute: get("minute"),
    second: get("second"),
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/**
 * Format a Date for display in the user's timezone.
 *
 * Thin wrapper ensuring consistent locale ("en-US") and timezone injection.
 * Pass one of the DISPLAY_* presets or custom Intl.DateTimeFormatOptions.
 */
export function formatForDisplay(
  date: Date,
  timezone: string,
  options: Intl.DateTimeFormatOptions = DISPLAY_DATETIME
): string {
  return date.toLocaleString("en-US", { timeZone: timezone, ...options });
}

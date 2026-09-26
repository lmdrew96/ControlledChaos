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
 * Shift a "YYYY-MM-DD" date key by whole days, staying in date-key space.
 *
 * Deliberately calendar arithmetic rather than instant arithmetic: adding
 * 24h to a Date crosses DST wrong twice a year, but "the day after
 * 2026-11-01" is 2026-11-02 regardless of what the clocks did.
 */
export function addDaysToDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  return shifted.toISOString().slice(0, 10);
}

/**
 * The canonical stored range for an all-day event on `dateKey` in `timezone`.
 *
 * ONE convention, used by creation, editing, Canvas sync, iCal export and
 * every range query: start is the instant of LOCAL midnight on the day, end
 * is the instant of local midnight on the NEXT day, exclusive.
 *
 * This matters because it is the same representation every range boundary
 * already uses (startOfDayInTimezone). All-day rows used to be written as a
 * naive "YYYY-MM-DDT00:00:00" string and parsed by `new Date()` in whatever
 * timezone the RUNTIME happened to be in — local on a dev machine, UTC on
 * Vercel. In production that put every all-day event 4-5 hours before local
 * midnight, i.e. inside the PREVIOUS day's range.
 *
 * The exclusive end also matches iCal's DTEND convention for VALUE=DATE, so
 * the export no longer has to invent a day.
 */
export function allDayRange(
  dateKey: string,
  timezone: string
): { startISO: string; endISO: string } {
  return {
    startISO: toUTC(`${dateKey}T00:00:00`, timezone),
    endISO: toUTC(`${addDaysToDateKey(dateKey, 1)}T00:00:00`, timezone),
  };
}

/**
 * The "YYYY-MM-DD" calendar day a given instant falls on, in `timezone`.
 */
export function toDateKeyInTimezone(date: Date, timezone: string): string {
  const { year, month, day } = toUserLocal(date, timezone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
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

/**
 * Return minutes since local midnight (0-1439) for a Date in the given timezone.
 */
export function getMinuteOfDayInTimezone(date: Date, timezone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const hour = parseInt(parts.find((p) => p.type === "hour")!.value, 10) % 24; // hour12:false can give 24 for midnight
  const minute = parseInt(parts.find((p) => p.type === "minute")!.value, 10);
  return hour * 60 + minute;
}

/**
 * Whether a configured local "HH:MM" time has already occurred today, in the
 * given timezone. Used by digest crons to fire on the first poll at-or-after
 * the configured time instead of requiring a poll to land inside a narrow
 * window — QStash's schedule cadence is reliable but still discrete (polls,
 * doesn't fire exactly on the configured time), so a window match could miss
 * the day entirely. Pair with a same-day dedup check so a late-running poll
 * still sends exactly once.
 */
export function hasLocalTimeArrivedToday(configuredTime: string, timezone: string): boolean {
  const [configHour, configMinute] = configuredTime.split(":").map(Number);
  const configMinutes = configHour * 60 + configMinute;
  return getMinuteOfDayInTimezone(new Date(), timezone) >= configMinutes;
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

/**
 * Date-only values (goal target dates) are stored as UTC midnight of the
 * chosen day, so their calendar day is the UTC date. Converting one into the
 * user's timezone shows the day before anywhere west of UTC.
 */
export function dateOnlyKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function formatDateOnly(
  date: Date,
  options: Intl.DateTimeFormatOptions = DISPLAY_DATE
): string {
  return date.toLocaleString("en-US", { timeZone: "UTC", ...options });
}

/**
 * Format a Date for inclusion in an AI prompt.
 *
 * Any date string handed to the model must be localized first — raw
 * `.toISOString()` output is UTC and reads as local time to the model,
 * silently shifting every downstream instruction by the user's UTC offset.
 * Use this instead of `.toISOString()` anywhere a date is interpolated into
 * a prompt sent to callHaiku/callSonnet.
 */
export function formatForAI(date: Date, timezone: string): string {
  return formatForDisplay(date, timezone, DISPLAY_FULL_DATETIME);
}

/**
 * Format a span of minutes as words: "1 hour 20 minutes", "2 days".
 */
export function formatReminderInterval(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < 1) return "less than a minute";

  const days = Math.floor(total / (60 * 24));
  const hours = Math.floor((total % (60 * 24)) / 60);
  const mins = total % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(days === 1 ? "1 day" : `${days} days`);
  if (hours > 0) parts.push(hours === 1 ? "1 hour" : `${hours} hours`);
  // Minutes are noise next to a multi-day span — "2 days 7 minutes" helps nobody.
  if (mins > 0 && days === 0) parts.push(mins === 1 ? "1 minute" : `${mins} minutes`);

  return parts.join(" ");
}

/**
 * Clock-measured distance from now, for labeling a time in an AI prompt:
 * "in 20 minutes", "5 minutes ago", "now".
 *
 * Every time handed to the model should carry one of these. Left to subtract
 * clock times itself, the model pairs the right gap with the wrong item — a
 * 10:10 push once said "20 minutes before your 11:30 meeting" because 10:30
 * was the next thing on the list.
 */
export function describeFromNow(date: Date, nowMs: number = Date.now()): string {
  const diff = Math.round((date.getTime() - nowMs) / 60000);
  if (diff === 0) return "now";
  return diff > 0
    ? `in ${formatReminderInterval(diff)}`
    : `${formatReminderInterval(-diff)} ago`;
}

/**
 * Whether `tz` is an IANA zone this runtime knows. An unknown one makes every
 * Intl call throw, so a bad value saved once would break each cron that
 * formats that user's time.
 */
export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * [start, end) spanning `days` whole local calendar days, beginning
 * `offsetDays` after the day `date` falls on in `timezone`.
 *
 * Use this instead of `start + days * 86_400_000`: a DST day is 23 or 25
 * hours long, so fixed-length math ends an hour early or late.
 */
export function localDaysRange(
  date: Date,
  timezone: string,
  days = 1,
  offsetDays = 0
): { start: Date; end: Date } {
  const firstKey = addDaysToDateKey(toDateKeyInTimezone(date, timezone), offsetDays);
  const lastKey = addDaysToDateKey(firstKey, days - 1);
  return {
    start: new Date(allDayRange(firstKey, timezone).startISO),
    end: new Date(allDayRange(lastKey, timezone).endISO),
  };
}


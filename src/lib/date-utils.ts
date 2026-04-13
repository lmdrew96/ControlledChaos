/**
 * Timezone-aware date utilities.
 *
 * The core problem: `new Date("2026-04-12T00:00:00")` creates midnight in
 * the *server's* local time (UTC on Vercel), not midnight in the user's
 * timezone. These helpers compute the correct UTC timestamp for midnight
 * in any IANA timezone.
 */

/**
 * Returns a Date representing midnight (00:00:00) of today in the given
 * timezone, expressed as a UTC timestamp.
 *
 * Example: for "America/New_York" (UTC-4 during EDT), if the user's local
 * date is April 12, this returns `2026-04-12T04:00:00Z` — because midnight
 * EDT = 4 AM UTC.
 */
export function startOfDayInTz(date: Date, timezone: string): Date {
  // 1. Get the calendar date in the user's timezone
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;

  // 2. Create UTC midnight for that calendar date
  const utcMidnight = new Date(`${y}-${m}-${d}T00:00:00Z`);

  // 3. Compute the timezone's UTC offset at that moment using the
  //    toLocaleString round-trip method
  const utcRepr = utcMidnight.toLocaleString("en-US", { timeZone: "UTC" });
  const tzRepr = utcMidnight.toLocaleString("en-US", { timeZone: timezone });
  const offsetMs = new Date(utcRepr).getTime() - new Date(tzRepr).getTime();

  // 4. Shift UTC midnight by the offset to get midnight in the user's TZ
  return new Date(utcMidnight.getTime() + offsetMs);
}

/**
 * Returns the user's current date as "YYYY-MM-DD" in their timezone.
 */
export function todayInTz(timezone: string): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;
  return `${y}-${m}-${d}`;
}

/**
 * Returns start of the current ISO week (Monday 00:00:00) in the user's
 * timezone, expressed as a UTC timestamp.
 */
export function startOfWeekInTz(timezone: string): Date {
  const today = startOfDayInTz(new Date(), timezone);
  const now = new Date();

  // Get the day of week in the user's timezone (0=Sun, 1=Mon, ..., 6=Sat)
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

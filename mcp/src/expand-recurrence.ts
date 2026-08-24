// Mirrors src/lib/calendar/expand-recurrence.ts in the main app.
// Duplicated (not imported) because the MCP server is a separate TS package
// with its own rootDir and can't reach outside mcp/src — keep both in sync
// if the recurrence rules change.

export interface RecurrenceInput {
  title: string;
  description?: string | null;
  location?: string | null;
  startTime: string; // ISO 8601
  endTime: string; // ISO 8601
  isAllDay?: boolean;
  recurrence?: {
    type: "daily" | "weekly";
    daysOfWeek?: number[]; // 0=Sun, 1=Mon, ..., 6=Sat
    endDate?: string; // ISO 8601
    exceptions?: string[]; // ISO 8601 or YYYY-MM-DD dates to skip (e.g. holidays)
    // IANA zone (e.g. "America/New_York"). When set, the time-of-day is preserved
    // as wall-clock time in this zone across DST transitions. When omitted,
    // occurrences are generated using the server's local time (legacy behavior).
    timeZone?: string;
  };
}

export interface ExpandedEvent {
  title: string;
  description: string | null;
  location: string | null;
  startTime: Date;
  endTime: Date;
  isAllDay: boolean;
}

const MAX_INSTANCES = 200;
const DEFAULT_WEEKS = 16; // One semester

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dateKeyOf(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function zonedDateKey(date: Date, timeZone: string): string {
  const { year, month, day } = getZonedParts(date, timeZone);
  return dateKeyOf(year, month, day);
}

// Bare "YYYY-MM-DD" strings parse as UTC midnight (per the Date spec), which
// mismatches the local/zoned keys used elsewhere here. Treat a bare date as
// the key directly instead of round-tripping it through a Date.
function resolveDateKey(value: string, timeZone?: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  return timeZone ? zonedDateKey(d, timeZone) : toDateKey(d);
}

function getZonedParts(date: Date, timeZone: string) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const hour = get("hour");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: hour === 24 ? 0 : hour,
    minute: get("minute"),
    second: get("second"),
  };
}

// Resolve a wall-clock date+time in `timeZone` to the correct UTC instant, DST-aware.
// Single-pass correction: correct for daytime class/event times, not validated
// for wall-clock times that fall within the DST transition window itself (e.g.
// 1-3am on the fall-back date), where the zoned time is ambiguous or skipped.
function zonedToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string
): Date {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  const zoned = getZonedParts(new Date(utcGuess), timeZone);
  const zonedAsUtc = Date.UTC(zoned.year, zoned.month - 1, zoned.day, zoned.hour, zoned.minute, zoned.second);
  return new Date(utcGuess + (utcGuess - zonedAsUtc));
}

function addCalendarDays(y: number, m: number, d: number, days: number) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate() };
}

function calendarDayOfWeek(y: number, m: number, d: number): number {
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * Expand a possibly-recurring event definition into concrete event instances.
 * Non-recurring events return a single-element array.
 */
export function expandRecurrence(input: RecurrenceInput): ExpandedEvent[] {
  const start = new Date(input.startTime);
  const end = new Date(input.endTime);
  const durationMs = end.getTime() - start.getTime();
  const isAllDay = input.isAllDay ?? false;

  const base: Omit<ExpandedEvent, "startTime" | "endTime"> = {
    title: input.title,
    description: input.description ?? null,
    location: input.location ?? null,
    isAllDay,
  };

  if (!input.recurrence || !input.recurrence.type) {
    return [{ ...base, startTime: start, endTime: end }];
  }

  const { type, daysOfWeek, endDate, timeZone } = input.recurrence;
  const events: ExpandedEvent[] = [];

  if (timeZone) {
    // Timezone-aware path: preserve wall-clock time-of-day across DST.
    const startZoned = getZonedParts(start, timeZone);
    const endKey = endDate
      ? resolveDateKey(endDate, timeZone)
      : zonedDateKey(new Date(start.getTime() + DEFAULT_WEEKS * 7 * 24 * 60 * 60 * 1000), timeZone);
    const startKey = dateKeyOf(startZoned.year, startZoned.month, startZoned.day);

    const pushInstance = (y: number, m: number, d: number) => {
      const startInstant = zonedToUtc(y, m, d, startZoned.hour, startZoned.minute, startZoned.second, timeZone);
      events.push({ ...base, startTime: startInstant, endTime: new Date(startInstant.getTime() + durationMs) });
    };

    if (type === "daily") {
      let cursor = { year: startZoned.year, month: startZoned.month, day: startZoned.day };
      while (dateKeyOf(cursor.year, cursor.month, cursor.day) <= endKey && events.length < MAX_INSTANCES) {
        pushInstance(cursor.year, cursor.month, cursor.day);
        cursor = addCalendarDays(cursor.year, cursor.month, cursor.day, 1);
      }
    } else if (type === "weekly") {
      const targetDays = daysOfWeek && daysOfWeek.length > 0
        ? daysOfWeek.filter((d) => d >= 0 && d <= 6)
        : [calendarDayOfWeek(startZoned.year, startZoned.month, startZoned.day)];

      const startDow = calendarDayOfWeek(startZoned.year, startZoned.month, startZoned.day);
      const backToMonday = (startDow + 6) % 7;
      let weekCursor = addCalendarDays(startZoned.year, startZoned.month, startZoned.day, -backToMonday);

      while (dateKeyOf(weekCursor.year, weekCursor.month, weekCursor.day) <= endKey && events.length < MAX_INSTANCES) {
        for (const dayOfWeek of targetDays) {
          if (events.length >= MAX_INSTANCES) break;
          const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
          const candidate = addCalendarDays(weekCursor.year, weekCursor.month, weekCursor.day, daysFromMonday);
          const candidateKey = dateKeyOf(candidate.year, candidate.month, candidate.day);

          if (candidateKey < startKey || candidateKey > endKey) continue;
          pushInstance(candidate.year, candidate.month, candidate.day);
        }
        weekCursor = addCalendarDays(weekCursor.year, weekCursor.month, weekCursor.day, 7);
      }

      events.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
    }
  } else {
    // Legacy path: server-local time (unchanged behavior for existing callers).
    const recurrenceEnd = endDate
      ? new Date(endDate)
      : new Date(start.getTime() + DEFAULT_WEEKS * 7 * 24 * 60 * 60 * 1000);

    if (type === "daily") {
      const cursor = new Date(start);
      while (cursor <= recurrenceEnd && events.length < MAX_INSTANCES) {
        events.push({
          ...base,
          startTime: new Date(cursor),
          endTime: new Date(cursor.getTime() + durationMs),
        });
        cursor.setDate(cursor.getDate() + 1);
      }
    } else if (type === "weekly") {
      const targetDays = daysOfWeek && daysOfWeek.length > 0
        ? daysOfWeek.filter((d) => d >= 0 && d <= 6)
        : [start.getDay()]; // Default to the start day

      // Find the first Monday of the week containing the start date
      const weekCursor = new Date(start);
      weekCursor.setDate(weekCursor.getDate() - ((weekCursor.getDay() + 6) % 7)); // Go to Monday
      weekCursor.setHours(start.getHours(), start.getMinutes(), start.getSeconds(), 0);

      while (weekCursor <= recurrenceEnd && events.length < MAX_INSTANCES) {
        for (const dayOfWeek of targetDays) {
          if (events.length >= MAX_INSTANCES) break;

          // Calculate the date for this day of the week
          const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Convert to Mon=0 offset
          const eventDate = new Date(weekCursor);
          eventDate.setDate(weekCursor.getDate() + daysFromMonday);
          eventDate.setHours(start.getHours(), start.getMinutes(), start.getSeconds(), 0);

          // Skip dates before the start or after the end
          if (eventDate < start || eventDate > recurrenceEnd) continue;

          events.push({
            ...base,
            startTime: new Date(eventDate),
            endTime: new Date(eventDate.getTime() + durationMs),
          });
        }

        // Move to next week
        weekCursor.setDate(weekCursor.getDate() + 7);
      }

      // Sort by date since days within a week may be out of order
      events.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
    }
  }

  if (input.recurrence.exceptions && input.recurrence.exceptions.length > 0) {
    const exceptionDates = new Set(
      input.recurrence.exceptions.map((e) => resolveDateKey(e, timeZone))
    );
    const keyOf = timeZone ? (d: Date) => zonedDateKey(d, timeZone) : toDateKey;
    return events.filter((e) => !exceptionDates.has(keyOf(e.startTime)));
  }

  return events;
}

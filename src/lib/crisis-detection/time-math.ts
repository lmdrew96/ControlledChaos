/**
 * Time math utilities for crisis detection.
 * Calculates blocked time (calendar events + sleep) within a time window.
 */

import { toUTC } from "@/lib/timezone";

interface CalendarBlock {
  startTime: Date;
  endTime: Date;
  isAllDay: boolean;
}

export interface BusyRow {
  title: string;
  startTime: Date;
  endTime: Date;
  isAllDay: boolean;
}

/**
 * Calendar rows as crisis busy time, in start order.
 *
 * The one place crisis busy time is built: the cron, the in-app status check
 * and the manual rescue route all call this. When the status check built its
 * own list (v2.86.1 and earlier), it disagreed with the cron and resolved
 * every detection the cron had just created.
 */
export function toBusyRows(
  events: Array<{ title: string; startTime: Date | string; endTime: Date | string; isAllDay?: boolean | null }>
): BusyRow[] {
  return events
    .map((e) => ({
      title: e.title,
      startTime: new Date(e.startTime),
      endTime: new Date(e.endTime),
      isAllDay: e.isAllDay ?? false,
    }))
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
}

/**
 * Convert a local hour on a specific date string to a UTC Date object.
 * Reuses the project's toUTC() utility from timezone.ts.
 */
function localHourToDate(dateStr: string, hour: number, timezone: string): Date {
  const padded = String(hour).padStart(2, "0");
  const utcIso = toUTC(`${dateStr}T${padded}:00:00`, timezone);
  return new Date(utcIso);
}

/**
 * Calculate total minutes blocked by calendar events within a window.
 * Only counts the overlap between each event and the window (handles partial overlaps).
 */
export function getCalendarBlockedMinutes(
  events: CalendarBlock[],
  windowStart: Date,
  windowEnd: Date
): number {
  let totalBlocked = 0;

  for (const event of events) {
    if (event.isAllDay) continue;

    const overlapStart = event.startTime > windowStart ? event.startTime : windowStart;
    const overlapEnd = event.endTime < windowEnd ? event.endTime : windowEnd;

    if (overlapStart < overlapEnd) {
      totalBlocked += (overlapEnd.getTime() - overlapStart.getTime()) / 60_000;
    }
  }

  return Math.round(totalBlocked);
}

interface Interval {
  start: number;
  end: number;
}

/**
 * Each night's sleep, clipped to the window, as ms intervals.
 * Handles the overnight wrap (e.g., sleep at 22:00, wake at 07:00).
 */
function getSleepIntervals(
  wakeTime: number,
  sleepTime: number,
  windowStart: Date,
  windowEnd: Date,
  timezone: string
): Interval[] {
  // If wake and sleep are the same, user is "always awake" — no sleep blocked
  if (wakeTime === sleepTime) return [];

  const intervals: Interval[] = [];
  const dayMs = 24 * 60 * 60 * 1000;
  const maxDays = Math.ceil((windowEnd.getTime() - windowStart.getTime()) / dayMs) + 1;

  for (let d = -1; d <= maxDays; d++) {
    // Get the calendar date for day d relative to windowStart
    const refDate = new Date(windowStart.getTime() + d * dayMs);
    const dateStr = refDate.toLocaleDateString("en-CA", { timeZone: timezone });

    // Sleep period: sleepTime on this date → wakeTime on next date
    const sleepStart = localHourToDate(dateStr, sleepTime, timezone);

    const nextDate = new Date(refDate.getTime() + dayMs);
    const nextDateStr = nextDate.toLocaleDateString("en-CA", { timeZone: timezone });
    const sleepEnd = localHourToDate(nextDateStr, wakeTime, timezone);

    const start = Math.max(sleepStart.getTime(), windowStart.getTime());
    const end = Math.min(sleepEnd.getTime(), windowEnd.getTime());
    if (start < end) intervals.push({ start, end });
  }

  return intervals;
}

/** Total minutes covered by a set of intervals, overlaps counted once. */
function unionMinutes(intervals: Interval[]): number {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  let total = 0;
  let curStart = -Infinity;
  let curEnd = -Infinity;
  for (const { start, end } of sorted) {
    if (start > curEnd) {
      if (curEnd > curStart) total += curEnd - curStart;
      curStart = start;
      curEnd = end;
    } else if (end > curEnd) {
      curEnd = end;
    }
  }
  if (curEnd > curStart) total += curEnd - curStart;
  return Math.round(total / 60_000);
}

/**
 * Calculate total minutes blocked by sleep within a time window.
 * Iterates each night that could overlap with the window and sums the overlap.
 */
export function getSleepBlockedMinutes(
  wakeTime: number,
  sleepTime: number,
  windowStart: Date,
  windowEnd: Date,
  timezone: string
): number {
  return unionMinutes(getSleepIntervals(wakeTime, sleepTime, windowStart, windowEnd, timezone));
}

/**
 * Minutes in the window that can't be worked: sleep plus calendar events,
 * as a UNION. Adding the two separately counted a late event that runs into
 * sleep (or two overlapping events) twice, and pushed available time toward
 * a false "no time left".
 */
export function getBlockedMinutes(
  events: CalendarBlock[],
  wakeTime: number,
  sleepTime: number,
  windowStart: Date,
  windowEnd: Date,
  timezone: string
): number {
  const ws = windowStart.getTime();
  const we = windowEnd.getTime();
  const eventIntervals = events
    .filter((e) => !e.isAllDay)
    .map((e) => ({
      start: Math.max(e.startTime.getTime(), ws),
      end: Math.min(e.endTime.getTime(), we),
    }))
    .filter((i) => i.start < i.end);
  return unionMinutes([
    ...eventIntervals,
    ...getSleepIntervals(wakeTime, sleepTime, windowStart, windowEnd, timezone),
  ]);
}

/**
 * Get total available minutes in a window after subtracting calendar and sleep blocks.
 */
export function getAvailableMinutes(
  events: CalendarBlock[],
  wakeTime: number,
  sleepTime: number,
  windowStart: Date,
  windowEnd: Date,
  timezone: string
): number {
  const totalMinutes = (windowEnd.getTime() - windowStart.getTime()) / 60_000;
  const blocked = getBlockedMinutes(events, wakeTime, sleepTime, windowStart, windowEnd, timezone);
  return Math.max(0, Math.round(totalMinutes - blocked));
}

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

/**
 * Calculate total minutes blocked by sleep within a time window.
 * Handles the overnight wrap (e.g., sleep at 22:00, wake at 07:00).
 *
 * Iterates each night that could overlap with the window and sums the overlap.
 */
export function getSleepBlockedMinutes(
  wakeTime: number,
  sleepTime: number,
  windowStart: Date,
  windowEnd: Date,
  timezone: string
): number {
  // If wake and sleep are the same, user is "always awake" — no sleep blocked
  if (wakeTime === sleepTime) return 0;

  let totalBlocked = 0;
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

    // Skip if sleep period doesn't overlap with our window
    if (sleepEnd <= windowStart || sleepStart >= windowEnd) continue;

    const overlapStart = sleepStart > windowStart ? sleepStart : windowStart;
    const overlapEnd = sleepEnd < windowEnd ? sleepEnd : windowEnd;

    if (overlapStart < overlapEnd) {
      totalBlocked += (overlapEnd.getTime() - overlapStart.getTime()) / 60_000;
    }
  }

  return Math.round(totalBlocked);
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
  const calendarBlocked = getCalendarBlockedMinutes(events, windowStart, windowEnd);
  const sleepBlocked = getSleepBlockedMinutes(wakeTime, sleepTime, windowStart, windowEnd, timezone);

  return Math.max(0, Math.round(totalMinutes - calendarBlocked - sleepBlocked));
}

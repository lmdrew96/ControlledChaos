import type { CalendarEvent, Task } from "@/types";
import { startOfDayInTimezone } from "@/lib/timezone";

/**
 * Fallback duration for a planned task with no estimate. A plan block's length
 * is `estimatedMinutes`, so this is the only place a missing estimate is
 * resolved — keep it in one spot so the calendar, the review sheet and the
 * free-block math never disagree about how long a block is.
 */
export const DEFAULT_PLAN_BLOCK_MINUTES = 30;

export function planBlockMinutes(estimatedMinutes: number | null): number {
  return estimatedMinutes ?? DEFAULT_PLAN_BLOCK_MINUTES;
}

export function planBlockEnd(
  scheduledFor: Date,
  estimatedMinutes: number | null
): Date {
  return new Date(
    scheduledFor.getTime() + planBlockMinutes(estimatedMinutes) * 60_000
  );
}

/**
 * The window "Plan my day" fills: from now until the user's sleep hour, today.
 *
 * Returns null when the day is already over (it is past the sleep hour), so
 * callers can say "nothing left to plan today" rather than proposing blocks
 * into a window that has closed.
 */
export function todayPlanningWindow(
  timezone: string,
  wakeHour: number,
  sleepHour: number,
  now: Date = new Date()
): { start: Date; end: Date } | null {
  const dayStart = startOfDayInTimezone(now, timezone);
  const wakeAt = new Date(dayStart.getTime() + wakeHour * 3_600_000);
  const sleepAt = new Date(dayStart.getTime() + sleepHour * 3_600_000);

  // Before wake time (a 2am planning session) the day still starts at wake.
  const start = now > wakeAt ? now : wakeAt;
  if (start >= sleepAt) return null;

  return { start, end: sleepAt };
}

/**
 * Represent committed plan blocks as busy intervals so the scheduler treats
 * already-planned work as occupied time. Without this, proposing a second
 * time would happily double-book on top of the first plan.
 *
 * These are shaped as CalendarEvents purely to satisfy the free-block math —
 * they are never persisted to the calendar_events table.
 */
export function planBlocksAsBusyIntervals(
  scheduledTasks: Array<
    Pick<Task, "id" | "title" | "scheduledFor" | "estimatedMinutes">
  >
): CalendarEvent[] {
  return scheduledTasks
    .filter((t) => t.scheduledFor)
    .map((t) => {
      const start = new Date(t.scheduledFor as string);
      return {
        id: `plan-${t.id}`,
        userId: "",
        source: "controlledchaos" as const,
        externalId: `plan-${t.id}`,
        title: t.title,
        description: null,
        startTime: start.toISOString(),
        endTime: planBlockEnd(start, t.estimatedMinutes).toISOString(),
        location: null,
        category: null,
        isAllDay: false,
        seriesId: null,
        sourceDumpId: null,
        syncedAt: start.toISOString(),
      };
    });
}

/**
 * A plan is an intention for a specific day. An unfinished block from an
 * earlier day is not carried forward — it is simply no longer shown, so every
 * morning starts clean instead of accumulating a backlog of missed intentions.
 *
 * Applied lazily at read time rather than by a nightly job: no cron to run, no
 * per-user midnight to schedule, and correct in every timezone by construction.
 */
export function isPlanBlockCurrent(
  scheduledFor: Date | string,
  timezone: string,
  now: Date = new Date()
): boolean {
  const at = typeof scheduledFor === "string" ? new Date(scheduledFor) : scheduledFor;
  return at >= startOfDayInTimezone(now, timezone);
}

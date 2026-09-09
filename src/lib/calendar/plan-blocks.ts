import type { CalendarEvent } from "@/types";
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

/**
 * One planned sitting. A task can have several, so `sessionId` — not the task
 * id — is what makes a block unique.
 *
 * `sessionMinutes` is that sitting's own length; null means it tracks the
 * task's estimate, which is what a single-block plan has always done. Three
 * 40-minute sessions is a different statement from one 120-minute estimate,
 * so the two are stored separately.
 */
export interface PlanBlockSource {
  /** The TASK id. Shared by every session of the same task. */
  id: string;
  title: string;
  scheduledFor: string | Date | null;
  estimatedMinutes: number | null;
  /** Unique per sitting. Falls back to the task id for single-block callers. */
  sessionId?: string;
  sessionMinutes?: number | null;
}

/** How long this particular sitting runs. */
function blockMinutes(t: PlanBlockSource): number {
  return planBlockMinutes(t.sessionMinutes ?? t.estimatedMinutes);
}

/** Stable, unique identity for one sitting. */
function blockKey(t: PlanBlockSource): string {
  return t.sessionId ?? t.id;
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
  scheduledTasks: PlanBlockSource[]
): CalendarEvent[] {
  return scheduledTasks
    .filter((t) => t.scheduledFor)
    .map((t) => {
      const start = new Date(t.scheduledFor as string);
      return {
        // Keyed by SESSION — two sittings of one task are two blocks, and a
        // shared id would collide as a React key and as a busy interval.
        id: `plan-${blockKey(t)}`,
        userId: "",
        source: "controlledchaos" as const,
        // The task id still rides here, so a task can recognise its own block
        // (see eventsAsBusyIntervals below, and findConflict's ignoreTaskId).
        externalId: `plan-${t.id}`,
        title: t.title,
        description: null,
        startTime: start.toISOString(),
        endTime: planBlockEnd(start, blockMinutes(t)).toISOString(),
        location: null,
        category: null,
        isAllDay: false,
        seriesId: null,
        sourceDumpId: null,
        syncedAt: start.toISOString(),
      };
    });
}

/** A claimed stretch of time, whatever claimed it. */
export interface BusyInterval {
  startMs: number;
  endMs: number;
  /** What is occupying the time, for a message the user can act on. */
  label: string;
  /** Set when the claim is a task's plan block, so a task can ignore its own. */
  taskId?: string;
}

/** The bits of a calendar event that matter for occupancy — DB row or serialized. */
export interface EventLike {
  title: string;
  startTime: string | Date;
  endTime: string | Date;
  isAllDay?: boolean | null;
  externalId?: string | null;
}

/** Real calendar events as busy intervals. All-day events never block a slot. */
export function eventsAsBusyIntervals(events: EventLike[]): BusyInterval[] {
  return events
    .filter((e) => !e.isAllDay)
    .map((e) => ({
      startMs: new Date(e.startTime).getTime(),
      endMs: new Date(e.endTime).getTime(),
      label: e.title,
      // Plan blocks round-tripped through planBlocksAsBusyIntervals() keep their
      // task id, so a task can still recognise its own block as its own.
      taskId: e.externalId?.startsWith("plan-")
        ? e.externalId.slice("plan-".length)
        : undefined,
    }));
}

/** Committed plan blocks as busy intervals, tagged with their task id. */
export function planBlocksAsBusy(
  scheduledTasks: PlanBlockSource[]
): BusyInterval[] {
  return scheduledTasks
    .filter((t) => t.scheduledFor)
    .map((t) => {
      const start = new Date(t.scheduledFor as string);
      return {
        startMs: start.getTime(),
        endMs: planBlockEnd(start, blockMinutes(t)).getTime(),
        label: t.title,
        taskId: t.id,
      };
    });
}

/**
 * The first interval a candidate collides with, or null if the slot is clear.
 *
 * Zero-length touches don't count: a block ending exactly when the next starts
 * is back-to-back, not a conflict.
 */
export function findConflict(
  startMs: number,
  endMs: number,
  busy: BusyInterval[],
  { ignoreTaskId }: { ignoreTaskId?: string } = {}
): BusyInterval | null {
  return (
    busy.find((interval) => {
      // Guard on `ignoreTaskId` being set: an untagged interval (a real
      // calendar event) has taskId === undefined, and would otherwise match
      // an absent ignoreTaskId and be skipped as if it were the task's own.
      const isOwnBlock =
        ignoreTaskId !== undefined && interval.taskId === ignoreTaskId;
      return !isOwnBlock && startMs < interval.endMs && endMs > interval.startMs;
    }) ?? null
  );
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

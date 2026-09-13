import { db } from "../index";
import { taskSessions, tasks } from "../schema";
import {
  eq,
  and,
  asc,
  gte,
  lt,
  isNull,
  isNotNull,
  inArray,
  ne,
  notExists,
  sql,
} from "drizzle-orm";
import { PLANNED_ON_CALENDAR_STATUSES } from "./tasks";

/**
 * Task work sessions — the planned blocks for a task.
 *
 * A task can be worked across several sittings, so the plan is a LIST. This
 * table is the source of truth; `tasks.scheduled_for` is a derived mirror of
 * the earliest session, maintained ONLY by syncTaskScheduledFor below.
 *
 * Every mutation in this file ends by calling that helper. If you add another
 * one, it must too — a session write that skips it leaves the mirror stale,
 * and the mirror is what the task card, the recommender and the MCP server
 * read.
 */

export interface TaskSession {
  id: string;
  taskId: string;
  startsAt: Date;
  /** NULL means "use the task's estimatedMinutes". */
  minutes: number | null;
}

/**
 * Recompute `tasks.scheduled_for` from this task's sessions.
 *
 * The mirror is the EARLIEST session, or null when there are none. Called
 * after every session mutation; it is the only writer of that column.
 */
async function syncTaskScheduledFor(
  taskId: string,
  userId: string
): Promise<Date | null> {
  const [earliest] = await db
    .select({ startsAt: taskSessions.startsAt })
    .from(taskSessions)
    .where(and(eq(taskSessions.taskId, taskId), eq(taskSessions.userId, userId)))
    .orderBy(asc(taskSessions.startsAt))
    .limit(1);

  const next = earliest?.startsAt ?? null;

  await db
    .update(tasks)
    .set({ scheduledFor: next, updatedAt: new Date() })
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));

  return next;
}

/** Every session for one task, soonest first. */
export async function getTaskSessions(
  taskId: string,
  userId: string
): Promise<TaskSession[]> {
  const rows = await db
    .select({
      id: taskSessions.id,
      taskId: taskSessions.taskId,
      startsAt: taskSessions.startsAt,
      minutes: taskSessions.minutes,
    })
    .from(taskSessions)
    .where(and(eq(taskSessions.taskId, taskId), eq(taskSessions.userId, userId)))
    .orderBy(asc(taskSessions.startsAt));

  return rows;
}

/** Sessions for several tasks at once, so a list view isn't N+1. */
export async function getSessionsForTasks(
  taskIds: string[],
  userId: string
): Promise<Map<string, TaskSession[]>> {
  const byTask = new Map<string, TaskSession[]>();
  if (taskIds.length === 0) return byTask;

  const rows = await db
    .select({
      id: taskSessions.id,
      taskId: taskSessions.taskId,
      startsAt: taskSessions.startsAt,
      minutes: taskSessions.minutes,
    })
    .from(taskSessions)
    .where(
      and(eq(taskSessions.userId, userId), inArray(taskSessions.taskId, taskIds))
    )
    .orderBy(asc(taskSessions.startsAt));

  for (const row of rows) {
    const list = byTask.get(row.taskId);
    if (list) list.push(row);
    else byTask.set(row.taskId, [row]);
  }
  return byTask;
}

/**
 * Add a session, leaving any existing ones alone. This is the multi-sitting
 * path — "also work on this Thursday morning".
 */
export async function addTaskSession(
  taskId: string,
  userId: string,
  startsAt: Date,
  minutes: number | null = null
): Promise<TaskSession | null> {
  const [owned] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId), isNull(tasks.deletedAt)))
    .limit(1);
  if (!owned) return null;

  const [created] = await db
    .insert(taskSessions)
    .values({ taskId, userId, startsAt, minutes })
    .returning({
      id: taskSessions.id,
      taskId: taskSessions.taskId,
      startsAt: taskSessions.startsAt,
      minutes: taskSessions.minutes,
    });

  await syncTaskScheduledFor(taskId, userId);
  return created ?? null;
}

/**
 * Replace every session on a task with a single one.
 *
 * This is what "Find me a time" does — it MOVES the plan rather than adding to
 * it, which is what the "Moved from X to Y" toast has always promised.
 */
export async function replaceTaskSessions(
  taskId: string,
  userId: string,
  startsAt: Date,
  minutes: number | null = null
): Promise<TaskSession | null> {
  await db
    .delete(taskSessions)
    .where(and(eq(taskSessions.taskId, taskId), eq(taskSessions.userId, userId)));

  return addTaskSession(taskId, userId, startsAt, minutes);
}

/**
 * Set the task's FIRST sitting — what the "Planned for" field edits.
 *
 * Moves the earliest existing session rather than replacing the plan, so a
 * task with three sittings keeps the other two when its first one is nudged.
 * Creates a session when there are none. This is the difference between
 * editing a plan and rewriting it.
 */
export async function setPrimaryTaskSession(
  taskId: string,
  userId: string,
  startsAt: Date
): Promise<TaskSession | null> {
  const [earliest] = await db
    .select({ id: taskSessions.id })
    .from(taskSessions)
    .where(and(eq(taskSessions.taskId, taskId), eq(taskSessions.userId, userId)))
    .orderBy(asc(taskSessions.startsAt))
    .limit(1);

  if (!earliest) return addTaskSession(taskId, userId, startsAt);
  return moveTaskSession(earliest.id, userId, startsAt);
}

/** Move one session to a new time. Used by calendar drag. */
export async function moveTaskSession(
  sessionId: string,
  userId: string,
  startsAt: Date,
  minutes?: number | null
): Promise<TaskSession | null> {
  const [updated] = await db
    .update(taskSessions)
    .set({
      startsAt,
      ...(minutes !== undefined ? { minutes } : {}),
    })
    .where(and(eq(taskSessions.id, sessionId), eq(taskSessions.userId, userId)))
    .returning({
      id: taskSessions.id,
      taskId: taskSessions.taskId,
      startsAt: taskSessions.startsAt,
      minutes: taskSessions.minutes,
    });

  if (!updated) return null;
  await syncTaskScheduledFor(updated.taskId, userId);
  return updated;
}

/** Remove one session. The task keeps its other sessions. */
export async function deleteTaskSession(
  sessionId: string,
  userId: string
): Promise<boolean> {
  const [deleted] = await db
    .delete(taskSessions)
    .where(and(eq(taskSessions.id, sessionId), eq(taskSessions.userId, userId)))
    .returning({ taskId: taskSessions.taskId });

  if (!deleted) return false;
  await syncTaskScheduledFor(deleted.taskId, userId);
  return true;
}

/** Drop every session on a task — "unschedule this". */
export async function clearTaskSessions(
  taskId: string,
  userId: string
): Promise<void> {
  await db
    .delete(taskSessions)
    .where(and(eq(taskSessions.taskId, taskId), eq(taskSessions.userId, userId)));
  await syncTaskScheduledFor(taskId, userId);
}

/**
 * Clear planned sessions inside a window — "Clear today's plan" and the
 * midnight rollover. A plan is an intention for a given day, and an unfinished
 * one should not survive into the next as evidence of failure.
 *
 * Returns the number of SESSIONS removed, which is no longer the same as the
 * number of tasks: one task may have had two sittings that day.
 */
export async function clearSessionsInRange(
  userId: string,
  start: Date,
  end: Date
): Promise<number> {
  const removed = await db
    .delete(taskSessions)
    .where(
      and(
        eq(taskSessions.userId, userId),
        gte(taskSessions.startsAt, start),
        lt(taskSessions.startsAt, end)
      )
    )
    .returning({ taskId: taskSessions.taskId });

  // Only the affected tasks need their mirror recomputed. A task with a
  // session left on another day keeps a (later) scheduledFor.
  const touched = [...new Set(removed.map((r) => r.taskId))];
  for (const taskId of touched) {
    await syncTaskScheduledFor(taskId, userId);
  }

  // Plans written straight to tasks.scheduled_for by an outside writer (the
  // MCP server) have no session to delete, so clear those too — otherwise
  // "clear today's plan" would visibly leave some blocks behind.
  const orphans = await db
    .update(tasks)
    .set({ scheduledFor: null, updatedAt: new Date() })
    .where(
      and(
        eq(tasks.userId, userId),
        isNull(tasks.deletedAt),
        isNotNull(tasks.scheduledFor),
        gte(tasks.scheduledFor, start),
        lt(tasks.scheduledFor, end)
      )
    )
    .returning({ id: tasks.id });

  return removed.length + orphans.length;
}

/**
 * Commit one accepted plan block as a session.
 *
 * estimatedMinutes doubles as a block's default duration, so when a task has
 * no estimate we backfill it from the proposed block. We only ever FILL IN a
 * missing value — an estimate the user set is never overwritten by the AI's.
 *
 * `mode` decides whether this block replaces the task's plan or adds to it.
 * "Find me a time" replaces (it is a move). A multi-block plan adds, so a task
 * the planner split across two sittings keeps both.
 */
export async function commitPlanSession(
  taskId: string,
  userId: string,
  startsAt: Date,
  proposedMinutes: number | null,
  mode: "replace" | "add" = "replace"
) {
  const [existing] = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      estimatedMinutes: tasks.estimatedMinutes,
    })
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId), isNull(tasks.deletedAt)))
    .limit(1);

  if (!existing) return null;

  if (existing.estimatedMinutes == null && proposedMinutes != null) {
    await db
      .update(tasks)
      .set({ estimatedMinutes: proposedMinutes, updatedAt: new Date() })
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));
  }

  // Only pin the session's own length when it differs from what the task
  // already implies; NULL keeps it tracking the task's estimate.
  const sessionMinutes =
    proposedMinutes != null && proposedMinutes !== existing.estimatedMinutes
      ? proposedMinutes
      : null;

  const session =
    mode === "replace"
      ? await replaceTaskSessions(taskId, userId, startsAt, sessionMinutes)
      : await addTaskSession(taskId, userId, startsAt, sessionMinutes);

  if (!session) return null;

  return {
    id: existing.id,
    title: existing.title,
    estimatedMinutes: existing.estimatedMinutes ?? proposedMinutes ?? null,
    session,
  };
}

/**
 * A planned block: one session joined to the task it belongs to.
 *
 * `scheduledFor` is THIS SESSION's start, not the task's mirror, so callers
 * that were written against the old one-block-per-task shape keep working —
 * they just see one row per sitting instead of one per task.
 */
export async function getScheduledSessionsInRange(
  userId: string,
  start: Date,
  end: Date
) {
  const [sessionRows, orphanRows] = await Promise.all([
    selectSessionRows(userId, start, end),
    // Reconciliation for writers outside this module. The MCP server writes
    // tasks.scheduled_for with raw SQL and deploys separately from the app, so
    // a plan Coru sets would otherwise show on the task card (which reads the
    // mirror) and be invisible on the calendar (which reads sessions) until
    // the MCP is redeployed. Treating an unmatched scheduled_for as an
    // implicit single session makes the calendar correct whoever wrote it.
    selectOrphanScheduledTasks(userId, start, end),
  ]);

  return [...sessionRows, ...orphanRows].sort(
    (a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime()
  );
}

async function selectSessionRows(userId: string, start: Date, end: Date) {
  const rows = await db
    .select({
      sessionId: taskSessions.id,
      sessionMinutes: taskSessions.minutes,
      scheduledFor: taskSessions.startsAt,
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
      status: tasks.status,
      priority: tasks.priority,
      energyLevel: tasks.energyLevel,
      estimatedMinutes: tasks.estimatedMinutes,
      category: tasks.category,
      locationTags: tasks.locationTags,
      deadline: tasks.deadline,
      targetDate: tasks.targetDate,
      sourceEventId: tasks.sourceEventId,
      goalId: tasks.goalId,
      progressSteps: tasks.progressSteps,
      currentStepIndex: tasks.currentStepIndex,
    })
    .from(taskSessions)
    .innerJoin(tasks, eq(tasks.id, taskSessions.taskId))
    .where(
      and(
        eq(taskSessions.userId, userId),
        isNull(tasks.deletedAt),
        inArray(tasks.status, [...PLANNED_ON_CALENDAR_STATUSES]),
        gte(taskSessions.startsAt, start),
        lt(taskSessions.startsAt, end)
      )
    )
    .orderBy(asc(taskSessions.startsAt));

  return rows;
}

/**
 * Tasks carrying a planned start in range that has no session row backing it.
 * See the note in getScheduledSessionsInRange.
 */
async function selectOrphanScheduledTasks(
  userId: string,
  start: Date,
  end: Date
) {
  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
      status: tasks.status,
      priority: tasks.priority,
      energyLevel: tasks.energyLevel,
      estimatedMinutes: tasks.estimatedMinutes,
      category: tasks.category,
      locationTags: tasks.locationTags,
      deadline: tasks.deadline,
      targetDate: tasks.targetDate,
      sourceEventId: tasks.sourceEventId,
      goalId: tasks.goalId,
      progressSteps: tasks.progressSteps,
      currentStepIndex: tasks.currentStepIndex,
      scheduledFor: tasks.scheduledFor,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        isNull(tasks.deletedAt),
        inArray(tasks.status, [...PLANNED_ON_CALENDAR_STATUSES]),
        isNotNull(tasks.scheduledFor),
        gte(tasks.scheduledFor, start),
        lt(tasks.scheduledFor, end),
        notExists(
          db
            .select({ one: sql`1` })
            .from(taskSessions)
            .where(
              and(
                eq(taskSessions.taskId, tasks.id),
                eq(taskSessions.startsAt, tasks.scheduledFor)
              )
            )
        )
      )
    );

  // Shaped exactly like a session row so callers can't tell the difference.
  // The synthetic id is prefixed so it is obvious in a key or a log that this
  // block has no session row behind it yet.
  return rows.map((r) => ({
    ...r,
    scheduledFor: r.scheduledFor as Date,
    sessionId: `legacy-${r.id}`,
    sessionMinutes: null as number | null,
  }));
}

/**
 * Sessions starting inside a window, for the "time to start" push trigger.
 * Excludes tasks already in progress — being told to start something you are
 * visibly already doing is the kind of thing that erodes trust in the alerts.
 */
export async function getSessionsStartingBetween(
  userId: string,
  start: Date,
  end: Date
) {
  return db
    .select({
      sessionId: taskSessions.id,
      taskId: tasks.id,
      taskTitle: tasks.title,
      taskDescription: tasks.description,
      sourceEventId: tasks.sourceEventId,
      scheduledFor: taskSessions.startsAt,
      estimatedMinutes: tasks.estimatedMinutes,
      sessionMinutes: taskSessions.minutes,
      deadline: tasks.deadline,
      targetDate: tasks.targetDate,
    })
    .from(taskSessions)
    .innerJoin(tasks, eq(tasks.id, taskSessions.taskId))
    .where(
      and(
        eq(taskSessions.userId, userId),
        isNull(tasks.deletedAt),
        ne(tasks.status, "completed"),
        ne(tasks.status, "in_progress"),
        gte(taskSessions.startsAt, start),
        lt(taskSessions.startsAt, end)
      )
    )
    .orderBy(asc(taskSessions.startsAt));
}

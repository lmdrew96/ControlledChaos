import { db } from "../index";
import { taskSessions, tasks } from "../schema";
import {
  eq,
  and,
  asc,
  gte,
  lt,
  lte,
  or,
  isNull,
  isNotNull,
  inArray,
  ne,
  notExists,
  sql,
} from "drizzle-orm";
import { PLANNED_ON_CALENDAR_STATUSES } from "./tasks";
import { DEFAULT_PLAN_BLOCK_MINUTES } from "@/lib/calendar/plan-blocks";
import {
  resolveSessionMinutes,
  sessionMarkers,
  type SessionOutcome,
} from "@/lib/calendar/session-minutes";

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
  /** Explicit length. NULL = an even share of the estimate (resolveSessionMinutes). */
  minutes: number | null;
  /** How it went, once answered. Absent on write paths that don't select it. */
  status?: SessionOutcome | null;
  actualMinutes?: number | null;
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

/** A session plus how long it actually runs once NULLs are resolved. */
export interface TaskSessionWithLength extends TaskSession {
  /** See resolveSessionMinutes. Null only when nothing gives it a length. */
  resolvedMinutes: number | null;
}

const SESSION_WITH_OUTCOME = {
  id: taskSessions.id,
  taskId: taskSessions.taskId,
  startsAt: taskSessions.startsAt,
  minutes: taskSessions.minutes,
  status: taskSessions.status,
  actualMinutes: taskSessions.actualMinutes,
};

const OUTCOMES: readonly SessionOutcome[] = ["done", "partial", "skipped"];

/** The column is free text in the DB; narrow it, treating anything else as unanswered. */
function asOutcomeRow<R extends { status: string | null }>(
  row: R
): Omit<R, "status"> & { status: SessionOutcome | null } {
  const status = OUTCOMES.includes(row.status as SessionOutcome)
    ? (row.status as SessionOutcome)
    : null;
  return { ...row, status };
}

/** Every session for one task, soonest first. */
export async function getTaskSessions(
  taskId: string,
  userId: string
): Promise<TaskSessionWithLength[]> {
  const [rows, [task]] = await Promise.all([
    db
      .select(SESSION_WITH_OUTCOME)
      .from(taskSessions)
      .where(and(eq(taskSessions.taskId, taskId), eq(taskSessions.userId, userId)))
      .orderBy(asc(taskSessions.startsAt)),
    db
      .select({ estimatedMinutes: tasks.estimatedMinutes })
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
      .limit(1),
  ]);

  const typed = rows.map(asOutcomeRow);
  const lengths = resolveSessionMinutes(task?.estimatedMinutes ?? null, typed);
  return typed.map((r) => ({ ...r, resolvedMinutes: lengths.get(r.id) ?? null }));
}

/**
 * Resolved length for every session of the given tasks, keyed by session id.
 *
 * Needs ALL of a task's sessions, not just the ones in the caller's window:
 * a sitting's share depends on how many siblings it's split with.
 */
async function resolvedLengthsFor(
  userId: string,
  tasksInView: Array<{ taskId: string; estimatedMinutes: number | null }>
): Promise<Map<string, number | null>> {
  const estimates = new Map(tasksInView.map((t) => [t.taskId, t.estimatedMinutes]));
  const byTask = await getSessionsForTasks([...estimates.keys()], userId);

  const out = new Map<string, number | null>();
  for (const [taskId, list] of byTask) {
    for (const [id, m] of resolveSessionMinutes(estimates.get(taskId) ?? null, list)) {
      out.set(id, m);
    }
  }
  return out;
}

/** Sessions for several tasks at once, so a list view isn't N+1. */
export async function getSessionsForTasks(
  taskIds: string[],
  userId: string
): Promise<Map<string, TaskSession[]>> {
  const byTask = new Map<string, TaskSession[]>();
  if (taskIds.length === 0) return byTask;

  const rows = await db
    .select(SESSION_WITH_OUTCOME)
    .from(taskSessions)
    .where(
      and(eq(taskSessions.userId, userId), inArray(taskSessions.taskId, taskIds))
    )
    .orderBy(asc(taskSessions.startsAt));

  for (const raw of rows) {
    const row = asOutcomeRow(raw);
    const list = byTask.get(row.taskId);
    if (list) list.push(row);
    else byTask.set(row.taskId, [row]);
  }
  return byTask;
}

/**
 * Attach the sitting each task should DISPLAY, derived from the clock now.
 *
 * `tasks.scheduled_for` mirrors the EARLIEST sitting and only changes when a
 * session is written, so a task planned for 9:45 AM and 9:00 PM kept showing
 * 9:45 AM all afternoon. Every read that surfaces "when is this planned" goes
 * through here instead, and `scheduledFor` on the returned rows is replaced
 * with: the next sitting that hasn't ended, else the most recent one, else
 * whatever the mirror held (a plan written without a session row).
 *
 * `passedSessionAt` is the most recent sitting that has already ended, so a
 * card can say "earlier 9:45 AM · next 9:00 PM".
 */
export async function withNextSession<
  T extends { id: string; estimatedMinutes: number | null; scheduledFor: Date | null },
>(
  rows: T[],
  userId: string,
  now: Date = new Date()
): Promise<
  Array<
    T & {
      nextSessionAt: Date | null;
      passedSessionAt: Date | null;
      /** Set for a real session row, so its outcome can be logged. */
      passedSessionId: string | null;
      passedSessionStatus: SessionOutcome | null;
      passedSessionMinutes: number | null;
    }
  >
> {
  const planned = rows.filter((r) => r.scheduledFor);
  const byTask = await getSessionsForTasks(planned.map((r) => r.id), userId);

  return rows.map((r) => {
    const list = byTask.get(r.id);
    if (!list || list.length === 0) {
      const past = r.scheduledFor != null && r.scheduledFor < now;
      return {
        ...r,
        nextSessionAt: past ? null : r.scheduledFor,
        passedSessionAt: past ? r.scheduledFor : null,
        passedSessionId: null,
        passedSessionStatus: null,
        passedSessionMinutes: null,
      };
    }
    const lengths = resolveSessionMinutes(r.estimatedMinutes, list);
    const { nextAt, passedAt, passed } = sessionMarkers(
      list.map((s) => ({
        id: s.id,
        startsAt: s.startsAt,
        minutes: lengths.get(s.id) ?? null,
        status: s.status ?? null,
      })),
      now
    );
    return {
      ...r,
      scheduledFor: nextAt ?? passedAt ?? r.scheduledFor,
      nextSessionAt: nextAt,
      passedSessionAt: passedAt,
      passedSessionId: passed?.id ?? null,
      passedSessionStatus: passed?.status ?? null,
      passedSessionMinutes: passed?.minutes ?? null,
    };
  });
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
 * Replace the task's plan with a single session.
 *
 * This is what "Find me a time" does — it MOVES the plan rather than adding to
 * it, which is what the "Moved from X to Y" toast has always promised.
 *
 * Only UNANSWERED sittings are replaced. One with a logged outcome is a
 * record of work that happened: deleting it made the Rescue plan's
 * remaining-work math overcount and took the outcome out of the recap.
 */
export async function replaceTaskSessions(
  taskId: string,
  userId: string,
  startsAt: Date,
  minutes: number | null = null
): Promise<TaskSession | null> {
  await db
    .delete(taskSessions)
    .where(
      and(
        eq(taskSessions.taskId, taskId),
        eq(taskSessions.userId, userId),
        isNull(taskSessions.status)
      )
    );

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
  // The earliest UNANSWERED sitting — one that's been answered is history,
  // and moving it would rewrite when it happened.
  const [earliest] = await db
    .select({ id: taskSessions.id })
    .from(taskSessions)
    .where(
      and(
        eq(taskSessions.taskId, taskId),
        eq(taskSessions.userId, userId),
        isNull(taskSessions.status)
      )
    )
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

/**
 * Record how a sitting went, or pass null to clear it.
 *
 * done → the sitting's own length counts as work done (resolved as if it
 * were still open, so marking it doesn't change what it's worth).
 * partial → `partialMinutes`, what the user says they got through.
 * skipped → 0; its time rolls into the remaining sittings.
 *
 * Returns null when the session doesn't exist or isn't this user's, or when
 * partial is given no usable minutes.
 */
export async function setSessionOutcome(
  sessionId: string,
  userId: string,
  outcome: SessionOutcome | null,
  partialMinutes?: number
): Promise<{ taskId: string; status: SessionOutcome | null; actualMinutes: number | null } | null> {
  const [row] = await db
    .select({ taskId: taskSessions.taskId })
    .from(taskSessions)
    .where(and(eq(taskSessions.id, sessionId), eq(taskSessions.userId, userId)))
    .limit(1);
  if (!row) return null;

  let actualMinutes: number | null = null;
  if (outcome === "partial") {
    if (partialMinutes === undefined || !Number.isFinite(partialMinutes) || partialMinutes <= 0) {
      return null;
    }
    actualMinutes = Math.round(partialMinutes);
  } else if (outcome === "skipped") {
    actualMinutes = 0;
  } else if (outcome === "done") {
    const sessions = await getTaskSessions(row.taskId, userId);
    const [task] = await db
      .select({ estimatedMinutes: tasks.estimatedMinutes })
      .from(tasks)
      .where(and(eq(tasks.id, row.taskId), eq(tasks.userId, userId)))
      .limit(1);
    const asIfOpen = sessions.map((s) =>
      s.id === sessionId ? { ...s, status: null, actualMinutes: null } : s
    );
    actualMinutes =
      resolveSessionMinutes(task?.estimatedMinutes ?? null, asIfOpen).get(sessionId) ??
      DEFAULT_PLAN_BLOCK_MINUTES;
  }

  await db
    .update(taskSessions)
    .set({ status: outcome, actualMinutes })
    .where(and(eq(taskSessions.id, sessionId), eq(taskSessions.userId, userId)));

  return { taskId: row.taskId, status: outcome, actualMinutes };
}

/**
 * Minutes of work already logged against each task, from sitting outcomes.
 * Crisis math subtracts this so a half-done task isn't counted at full size.
 */
export async function getLoggedMinutesForTasks(
  taskIds: string[],
  userId: string
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (taskIds.length === 0) return out;
  const rows = await db
    .select({
      taskId: taskSessions.taskId,
      logged: sql<number>`coalesce(sum(${taskSessions.actualMinutes}), 0)::int`,
    })
    .from(taskSessions)
    .where(
      and(
        eq(taskSessions.userId, userId),
        inArray(taskSessions.taskId, taskIds),
        isNotNull(taskSessions.status)
      )
    )
    .groupBy(taskSessions.taskId);
  for (const r of rows) out.set(r.taskId, Number(r.logged));
  return out;
}

/**
 * Drop the task's planned sessions — "unschedule this". Answered sittings
 * stay: they're what happened, not what's planned.
 */
export async function clearTaskSessions(
  taskId: string,
  userId: string
): Promise<void> {
  await db
    .delete(taskSessions)
    .where(
      and(
        eq(taskSessions.taskId, taskId),
        eq(taskSessions.userId, userId),
        isNull(taskSessions.status)
      )
    );
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
  // Only what's still ahead and unanswered. A sitting already underway or
  // past stays: "clear" is about the rest of the day, not rewriting it.
  const now = new Date();
  const from = start.getTime() > now.getTime() ? start : now;

  const removed = await db
    .delete(taskSessions)
    .where(
      and(
        eq(taskSessions.userId, userId),
        isNull(taskSessions.status),
        gte(taskSessions.startsAt, from),
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
        gte(tasks.scheduledFor, from),
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
  const [rawSessionRows, orphanRows] = await Promise.all([
    selectSessionRows(userId, start, end),
    // Reconciliation for writers outside this module. The MCP server writes
    // tasks.scheduled_for with raw SQL and deploys separately from the app, so
    // a plan Coru sets would otherwise show on the task card (which reads the
    // mirror) and be invisible on the calendar (which reads sessions) until
    // the MCP is redeployed. Treating an unmatched scheduled_for as an
    // implicit single session makes the calendar correct whoever wrote it.
    selectOrphanScheduledTasks(userId, start, end),
  ]);

  // sessionMinutes leaves here RESOLVED, so every caller's existing
  // `sessionMinutes ?? estimatedMinutes` reads the split, not the full clone.
  const lengths = await resolvedLengthsFor(
    userId,
    rawSessionRows.map((r) => ({ taskId: r.id, estimatedMinutes: r.estimatedMinutes }))
  );
  const sessionRows = rawSessionRows.map((r) => ({
    ...r,
    sessionMinutes: lengths.get(r.sessionId) ?? r.sessionMinutes,
  }));

  return [...sessionRows, ...orphanRows].sort(
    (a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime()
  );
}

async function selectSessionRows(userId: string, start: Date, end: Date) {
  const rows = await db
    .select({
      sessionId: taskSessions.id,
      sessionMinutes: taskSessions.minutes,
      sessionStatus: taskSessions.status,
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
    sessionStatus: null as string | null,
  }));
}

/**
 * Sessions starting inside a window, for the "time to start" push trigger.
 * Excludes tasks already in progress — being told to start something you are
 * visibly already doing is the kind of thing that erodes trust in the alerts.
 * Also excludes tasks snoozed past now: snoozing hides the task, and its
 * sittings stay on the calendar, so without this the push undoes the snooze.
 * Cancelled tasks are out too — MCP cc_update_task and the detail modal both
 * set that status, and a cancelled task's sittings don't get deleted.
 */
export async function getSessionsStartingBetween(
  userId: string,
  start: Date,
  end: Date
) {
  const rows = await db
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
        ne(tasks.status, "cancelled"),
        or(isNull(tasks.snoozedUntil), lte(tasks.snoozedUntil, new Date())),
        gte(taskSessions.startsAt, start),
        lt(taskSessions.startsAt, end)
      )
    )
    .orderBy(asc(taskSessions.startsAt));

  const lengths = await resolvedLengthsFor(
    userId,
    rows.map((r) => ({ taskId: r.taskId, estimatedMinutes: r.estimatedMinutes }))
  );
  return rows.map((r) => ({
    ...r,
    sessionMinutes: lengths.get(r.sessionId) ?? r.sessionMinutes,
  }));
}

import { db } from "../index";
import { taskActivity, tasks } from "../schema";
import { eq, and, asc, desc, ne, gt, gte, lt, lte, or, inArray, notInArray, isNull, isNotNull, notLike, sql } from "drizzle-orm";
import type { ParsedTask } from "@/types";
import { startOfDayInTimezone } from "@/lib/timezone";
import { deleteTaskScheduleEvents } from "./calendar";
import { withNextSession } from "./sessions";
import { completeCrisisPlansForTask } from "./crisis";

// ============================================================
// Tasks
// ============================================================

/**
 * Task statuses whose plan block still belongs on the calendar.
 *
 * A plan is an intention for work still ahead of you. Once a task is completed
 * or cancelled it stops being one — the calendar drops it, and the Daily Recap
 * is where a timeline of finished work lives. getScheduledTasksInRange filters
 * on this, and updateTask uses it to know when a task has left the calendar and
 * its materialized cc- event needs clearing.
 */
/**
 * Planned work now lives in task_sessions — see queries/sessions.ts for the
 * range query (getScheduledSessionsInRange), the writers (addTaskSession,
 * replaceTaskSessions, commitPlanSession) and the window clear
 * (clearSessionsInRange). getScheduledTasksInRange / clearScheduledInRange /
 * commitPlanBlock used to live here and were replaced by those, because a
 * task can be planned across more than one sitting.
 */
export const PLANNED_ON_CALENDAR_STATUSES = [
  "pending",
  "in_progress",
  "snoozed",
] as const;
export async function createTask(
  userId: string,
  params: {
    title: string;
    description?: string | null;
    priority?: string;
    energyLevel?: string;
    estimatedMinutes?: number | null;
    category?: string | null;
    locationTags?: string[] | null;
    deadline?: Date | null;
    targetDate?: Date | null;
    goalId?: string | null;
    sourceEventId?: string | null;
  }
) {
  const [task] = await db
    .insert(tasks)
    .values({
      userId,
      title: params.title,
      description: params.description ?? null,
      priority: params.priority ?? "normal",
      energyLevel: params.energyLevel ?? "medium",
      estimatedMinutes: params.estimatedMinutes ?? null,
      category: params.category ?? null,
      locationTags: params.locationTags?.length ? params.locationTags : null,
      deadline: params.deadline ?? null,
      targetDate: params.targetDate ?? null,
      goalId: params.goalId ?? null,
      sourceEventId: params.sourceEventId ?? null,
    })
    .returning();
  return task;
}

/**
 * Look up a task previously auto-generated from a Canvas event.
 * Returns the task regardless of status or deletedAt state — callers use this
 * for dedup, and we never want to recreate a task the user already has or
 * soft-deleted.
 */
export async function findTaskBySourceEventId(
  userId: string,
  sourceEventId: string
) {
  const [task] = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        eq(tasks.sourceEventId, sourceEventId)
      )
    )
    .limit(1);
  return task ?? null;
}

export async function createTasksFromDump(
  userId: string,
  dumpId: string,
  parsedTasks: ParsedTask[],
  existingGoals?: { id: string; title: string }[]
) {
  if (parsedTasks.length === 0) return [];

  const goalIdByTitle = new Map(
    (existingGoals ?? []).map((g) => [g.title.toLowerCase(), g.id])
  );

  const values = parsedTasks.map((task) => ({
    userId,
    title: task.title,
    description: task.description ?? null,
    priority: task.priority,
    energyLevel: task.energyLevel,
    estimatedMinutes: task.estimatedMinutes ?? null,
    category: task.category ?? null,
    locationTags: task.locationTags?.length ? task.locationTags : null,
    deadline: task.deadline ? new Date(task.deadline) : null,
    targetDate: task.targetDate ? new Date(task.targetDate) : null,
    goalId: task.goalConnection
      ? (goalIdByTitle.get(task.goalConnection.toLowerCase()) ?? null)
      : null,
    sourceDumpId: dumpId,
    // No sortOrder: other creates leave it null, and nulls sort last, so
    // numbering these 0..n pinned every dump's tasks above the rest.
  }));

  const created = await db.insert(tasks).values(values).returning();
  return created;
}

export async function getTasksByUser(
  userId: string,
  options?: { status?: string; includeCancelled?: boolean }
) {
  const conditions = [eq(tasks.userId, userId), isNull(tasks.deletedAt)];

  if (options?.status) {
    conditions.push(eq(tasks.status, options.status));
  } else if (!options?.includeCancelled) {
    // By default, exclude cancelled tasks
    conditions.push(ne(tasks.status, "cancelled"));
  }

  const rows = await db
    .select()
    .from(tasks)
    .where(and(...conditions))
    .orderBy(asc(tasks.sortOrder), desc(tasks.createdAt));
  // scheduledFor comes back as the NEXT sitting, not the stored earliest one.
  return withNextSession(rows, userId);
}

/**
 * Actionable tasks whose hard deadline falls inside [from, to).
 *
 * Crisis detection only ever looks at this slice, but used to get there by
 * pulling every non-cancelled task for the user and filtering in JS — a few
 * hundred rows serialized and parsed per call to find the handful that matter.
 * The endpoint re-runs on a timer and on every window focus, so that waste was
 * paid over and over.
 */
export async function getActionableTasksWithDeadlineInRange(
  userId: string,
  from: Date,
  to: Date
) {
  return db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        isNull(tasks.deletedAt),
        // Open work, plus snoozed tasks whose snooze has run out — the same
        // pool getPendingTasks treats as actionable.
        or(
          inArray(tasks.status, ["pending", "in_progress"]),
          and(
            eq(tasks.status, "snoozed"),
            or(isNull(tasks.snoozedUntil), lt(tasks.snoozedUntil, new Date()))
          )
        ),
        // Exclusive lower / inclusive upper, matching the JS filter this
        // replaced (dl > now && dl <= windowEnd) exactly.
        gt(tasks.deadline, from),
        lte(tasks.deadline, to)
      )
    )
    .orderBy(asc(tasks.deadline));
}

export async function updateTask(
  taskId: string,
  userId: string,
  data: Partial<{
    title: string;
    description: string | null;
    status: string;
    priority: string;
    energyLevel: string;
    estimatedMinutes: number | null;
    category: string | null;
    locationTags: string[] | null;
    deadline: Date | null;
    targetDate: Date | null;
    snoozedUntil: Date | null;
    completedAt: Date | null;
    progressSteps: object[] | null;
    currentStepIndex: number;
    sortOrder: number | null;
    goalId: string | null;
  }>
) {
  const [updated] = await db
    .update(tasks)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
    .returning();

  // Completing or cancelling a task takes it off the calendar. The plan block
  // vanishes on its own (the session queries filter by status), but older
  // versions materialized plans as standalone `cc-{taskId}-…` calendar rows,
  // and any still around would otherwise sit there all day. (scheduledFor is
  // no longer accepted here — it's a mirror the session layer maintains.)
  const leftTheCalendar =
    data.status !== undefined &&
    !(PLANNED_ON_CALENDAR_STATUSES as readonly string[]).includes(data.status);

  if (updated && leftTheCalendar) {
    await deleteTaskScheduleEvents(userId, taskId).catch((err) =>
      console.error("[DB] Failed to clear stale schedule events:", err)
    );
  }

  // Finishing the task finishes the Rescue plan that was about it.
  if (updated && data.status === "completed") {
    await completeCrisisPlansForTask(userId, taskId).catch((err) =>
      console.error("[DB] Failed to close the task's Rescue plan:", err)
    );
  }

  return updated;
}

export async function reorderTasks(
  userId: string,
  orderedIds: string[]
) {
  // db.batch sends every update in one HTTP transaction — atomic, one round
  // trip. neon-http has no db.transaction (it throws), which is why this used
  // to 500 on every drag.
  const now = new Date();
  const [first, ...rest] = orderedIds.map((id, i) =>
    db
      .update(tasks)
      .set({ sortOrder: i, updatedAt: now })
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
  );
  if (first) await db.batch([first, ...rest]);
}

/**
 * Soft-delete the auto-generated tasks belonging to a set of Canvas events.
 *
 * Deselecting a course in settings stops its events from syncing, and
 * deleteStaleCalendarEvents clears the calendar rows — but the tasks the sync
 * already created from those events had nothing cleaning them up, so a
 * deselected course kept a dozen assignments sitting in the task list forever.
 *
 * Scoped tightly on purpose: only tasks still pending and not already deleted.
 * Completed work stays in the record (the Daily Recap reads it), and a task the
 * user deleted by hand is left alone so re-selecting the course doesn't
 * resurrect it.
 */
export async function deleteTasksBySourceEventIds(
  userId: string,
  sourceEventIds: string[]
) {
  if (sourceEventIds.length === 0) return [];

  const now = new Date();
  const removed = await db
    .update(tasks)
    .set({ deletedAt: now, updatedAt: now })
    .where(
      and(
        eq(tasks.userId, userId),
        inArray(tasks.sourceEventId, sourceEventIds),
        ne(tasks.status, "completed"),
        isNull(tasks.deletedAt)
      )
    )
    .returning();

  // Mark these as removed BY DESELECTION, stamped with the same instant as
  // deletedAt. getTasksRetiredByDeselection matches on that equality, so a
  // task the user deletes by hand later (a different deletedAt) is never
  // brought back when the course is re-selected.
  await logCanvasRetirement(userId, removed, CANVAS_DESELECTED, now);
  return removed;
}

/** task_activity actions written by Canvas sync, not by the user. */
const CANVAS_DESELECTED = "canvas_deselected";
const CANVAS_REMOVED = "canvas_removed";

async function logCanvasRetirement(
  userId: string,
  removed: { id: string }[],
  action: string,
  at: Date
) {
  if (removed.length === 0) return;
  await db
    .insert(taskActivity)
    .values(removed.map((t) => ({ userId, taskId: t.id, action, createdAt: at })));
}

/**
 * Canvas tasks retired because their course was deselected, keyed by
 * sourceEventId. Only those still in that state: deletedAt must equal the
 * marker's timestamp, so a later hand-delete doesn't count.
 */
export async function getTasksRetiredByDeselection(
  userId: string
): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: tasks.id, sourceEventId: tasks.sourceEventId })
    .from(tasks)
    .innerJoin(
      taskActivity,
      and(
        eq(taskActivity.taskId, tasks.id),
        eq(taskActivity.action, CANVAS_DESELECTED),
        eq(taskActivity.createdAt, tasks.deletedAt)
      )
    )
    .where(and(eq(tasks.userId, userId), isNotNull(tasks.deletedAt)));
  return new Map(rows.flatMap((r) => (r.sourceEventId ? [[r.sourceEventId, r.id]] : [])));
}

export async function restoreTask(taskId: string, userId: string) {
  const [restored] = await db
    .update(tasks)
    .set({ deletedAt: null, updatedAt: new Date() })
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
    .returning();
  return restored ?? null;
}

/**
 * Retire open Canvas tasks whose item is gone from the feed — an assignment
 * the instructor deleted or unpublished. Only tasks still due in the future:
 * a feed can drop old items as the term goes on, and an overdue task you still
 * mean to finish shouldn't vanish for that.
 */
export async function retireVanishedCanvasTasks(userId: string, feedUids: string[]) {
  // An empty feed is far more likely a fetch hiccup than a term with nothing
  // in it, and retiring against it would clear every Canvas task.
  if (feedUids.length === 0) return [];
  const now = new Date();
  const removed = await db
    .update(tasks)
    .set({ deletedAt: now, updatedAt: now })
    .where(
      and(
        eq(tasks.userId, userId),
        isNotNull(tasks.sourceEventId),
        notInArray(tasks.sourceEventId, feedUids),
        inArray(tasks.status, ["pending", "in_progress", "snoozed"]),
        gt(tasks.deadline, now),
        isNull(tasks.deletedAt)
      )
    )
    .returning();
  await logCanvasRetirement(userId, removed, CANVAS_REMOVED, now);
  return removed;
}

export async function deleteTask(taskId: string, userId: string) {
  // Soft delete — set deletedAt instead of removing the row
  const [deleted] = await db
    .update(tasks)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
    .returning();

  // The task is gone from every list, but its materialized plan block is a
  // standalone calendar row — without this it stays on the calendar pointing
  // at a task the user can no longer open.
  if (deleted) {
    await deleteTaskScheduleEvents(userId, taskId).catch((err) =>
      console.error("[DB] Failed to clear schedule events on delete:", err)
    );
  }

  return deleted;
}


// ============================================================
// Task Activity
// ============================================================
export async function logTaskActivity(params: {
  userId: string;
  taskId: string;
  action: string;
  context?: Record<string, unknown>;
}) {
  const [activity] = await db
    .insert(taskActivity)
    .values({
      userId: params.userId,
      taskId: params.taskId,
      action: params.action,
      context: params.context ?? null,
    })
    .returning();

  return activity;
}

export async function getRecentTaskActivity(
  userId: string,
  limit: number = 20
) {
  return db
    .select()
    .from(taskActivity)
    // Canvas sync's retirement markers aren't something the user did.
    .where(and(eq(taskActivity.userId, userId), notLike(taskActivity.action, "canvas_%")))
    .orderBy(desc(taskActivity.createdAt))
    .limit(limit);
}

export async function getTasksCompletedToday(userId: string, timezone: string) {
  const startOfDay = startOfDayInTimezone(new Date(), timezone);

  return db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        eq(tasks.status, "completed"),
        gte(tasks.completedAt, startOfDay),
        isNull(tasks.deletedAt)
      )
    );
}


// ============================================================
// Pending Tasks for Recommendation
// ============================================================
export async function getPendingTasks(userId: string) {
  const now = new Date();
  const rows = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        isNull(tasks.deletedAt),
        or(
          // Active tasks
          inArray(tasks.status, ["pending", "in_progress"]),
          // Snoozed tasks whose snooze window has expired — wake them up
          and(
            eq(tasks.status, "snoozed"),
            or(
              isNull(tasks.snoozedUntil),
              lt(tasks.snoozedUntil, now)
            )
          )
        )
      )
    )
    .orderBy(
      sql`CASE WHEN ${tasks.deadline} IS NULL THEN 1 ELSE 0 END`,
      asc(tasks.deadline),
      desc(tasks.createdAt)
    );
  // Every AI surface (snapshot, recommender, digests) reads scheduledFor as
  // "when is this planned next", so resolve it from the sessions here once.
  return withNextSession(rows, userId, now);
}



// ============================================================
// Plan blocks — tasks with a scheduledFor, rendered as an intention
// layer on the calendar rather than as real calendar events.
// ============================================================

/**
 * Tasks planned into a time range. Active work only — completed, cancelled
 * and soft-deleted tasks drop out so a finished plan block disappears from
 * every surface at once (the whole reason plans are not calendar events).
 */



import { db } from "../index";
import { goals, tasks } from "../schema";
import { eq, and, asc, desc, gte, isNull, inArray, notInArray, sql } from "drizzle-orm";
import { startOfWeekInTimezone } from "@/lib/timezone";

// ============================================================
// Goals
// ============================================================

/** Statuses that mean a task is no longer work left to do. */
const CLOSED_TASK_STATUSES = ["completed", "cancelled"];

export async function getUserGoals(userId: string, status?: string) {
  const conditions = [eq(goals.userId, userId), isNull(goals.deletedAt)];
  if (status) {
    conditions.push(eq(goals.status, status));
  }
  // Manual order first; goals never dragged fall back to newest-first.
  return db
    .select()
    .from(goals)
    .where(and(...conditions))
    .orderBy(sql`${goals.sortOrder} asc nulls last`, desc(goals.createdAt));
}

export async function getGoal(goalId: string, userId: string) {
  const [goal] = await db
    .select()
    .from(goals)
    .where(and(eq(goals.id, goalId), eq(goals.userId, userId), isNull(goals.deletedAt)))
    .limit(1);
  return goal ?? null;
}

export async function createGoal(
  userId: string,
  data: {
    title: string;
    description?: string | null;
    targetDate?: Date | null;
  }
) {
  // A new goal goes to the top of the manual order — it's what you're
  // thinking about right now.
  const [goal] = await db
    .insert(goals)
    .values({
      userId,
      title: data.title,
      description: data.description ?? null,
      targetDate: data.targetDate ?? null,
      sortOrder: sql`(select coalesce(min(${goals.sortOrder}), 0) - 1 from ${goals} where ${goals.userId} = ${userId})`,
    })
    .returning();
  return goal;
}

export async function updateGoal(
  goalId: string,
  userId: string,
  data: Partial<{
    title: string;
    description: string | null;
    targetDate: Date | null;
    status: string;
    reflection: string | null;
  }>
) {
  // completedAt follows status: stamped on finishing, cleared on reopen/pause.
  const completedAt =
    data.status === undefined ? {} : { completedAt: data.status === "completed" ? new Date() : null };
  const [updated] = await db
    .update(goals)
    .set({ ...data, ...completedAt, updatedAt: new Date() })
    .where(and(eq(goals.id, goalId), eq(goals.userId, userId), isNull(goals.deletedAt)))
    .returning();
  return updated ?? null;
}

export async function reorderGoals(userId: string, orderedIds: string[]) {
  // One HTTP transaction — neon-http has no db.transaction.
  const now = new Date();
  const [first, ...rest] = orderedIds.map((id, i) =>
    db
      .update(goals)
      .set({ sortOrder: i, updatedAt: now })
      .where(and(eq(goals.id, id), eq(goals.userId, userId)))
  );
  if (first) await db.batch([first, ...rest]);
}

export async function deleteGoal(goalId: string, userId: string) {
  // Unlink its tasks and soft-delete the goal in one transaction (neon-http has
  // no db.transaction), so a failure can't strand tasks unlinked from a live goal.
  const [, [deleted]] = await db.batch([
    db
      .update(tasks)
      .set({ goalId: null })
      .where(and(eq(tasks.goalId, goalId), eq(tasks.userId, userId))),
    db
      .update(goals)
      .set({ deletedAt: new Date() })
      .where(and(eq(goals.id, goalId), eq(goals.userId, userId)))
      .returning(),
  ]);
  return deleted ?? null;
}

export async function getGoalTaskCounts(userId: string, weekStart?: Date) {
  const rows = await db
    .select({
      goalId: tasks.goalId,
      // Cancelled tasks aren't work left to do, so they'd hold a goal below 100% forever.
      total: sql<number>`count(*) filter (where ${tasks.status} <> 'cancelled')::int`,
      completed: sql<number>`count(*) filter (where ${tasks.status} = 'completed')::int`,
      completedThisWeek: weekStart
        ? // gte() maps the Date through the column's driver mapping, like any typed filter.
          sql<number>`count(*) filter (where ${tasks.status} = 'completed' and ${gte(tasks.completedAt, weekStart)})::int`
        : sql<number>`0`,
    })
    .from(tasks)
    .where(and(eq(tasks.userId, userId), sql`${tasks.goalId} is not null`, isNull(tasks.deletedAt)))
    .groupBy(tasks.goalId);
  return rows as { goalId: string; total: number; completed: number; completedThisWeek: number }[];
}

/**
 * Sort key for "what's next": the soonest of planned, target and due; tasks
 * with none of those come after, in the order they were made.
 */
function nextStepKey(t: {
  scheduledFor: Date | null;
  targetDate: Date | null;
  deadline: Date | null;
}): number {
  const times = [t.scheduledFor, t.targetDate, t.deadline]
    .filter((d): d is Date => !!d)
    .map((d) => d.getTime());
  return times.length > 0 ? Math.min(...times) : Number.POSITIVE_INFINITY;
}

/** The next open step for each goal that has one, keyed by goal id. */
export async function getGoalNextSteps(
  userId: string,
  goalIds?: string[]
): Promise<Map<string, { id: string; title: string }>> {
  if (goalIds && goalIds.length === 0) return new Map();
  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      goalId: tasks.goalId,
      scheduledFor: tasks.scheduledFor,
      targetDate: tasks.targetDate,
      deadline: tasks.deadline,
      createdAt: tasks.createdAt,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        isNull(tasks.deletedAt),
        notInArray(tasks.status, CLOSED_TASK_STATUSES),
        goalIds ? inArray(tasks.goalId, goalIds) : sql`${tasks.goalId} is not null`
      )
    )
    .orderBy(asc(tasks.createdAt));

  const best = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (!row.goalId) continue;
    const current = best.get(row.goalId);
    if (!current || nextStepKey(row) < nextStepKey(current)) best.set(row.goalId, row);
  }
  return new Map([...best].map(([goalId, t]) => [goalId, { id: t.id, title: t.title }]));
}

/** Every live task linked to a goal, open ones first. */
export async function getGoalTasks(goalId: string, userId: string) {
  return db
    .select()
    .from(tasks)
    .where(and(eq(tasks.goalId, goalId), eq(tasks.userId, userId), isNull(tasks.deletedAt)))
    .orderBy(
      sql`case when ${tasks.status} in ('completed', 'cancelled') then 1 else 0 end`,
      desc(tasks.completedAt),
      asc(tasks.createdAt)
    );
}

/**
 * After a task is completed: if that was the last open step of an active goal,
 * return the goal so the client can offer to call it done.
 */
export async function getGoalFinishedByTask(
  userId: string,
  taskGoalId: string | null
): Promise<{ id: string; title: string } | null> {
  if (!taskGoalId) return null;
  const goal = await getGoal(taskGoalId, userId);
  if (!goal || goal.status !== "active") return null;
  const [{ open }] = await db
    .select({ open: sql<number>`count(*)::int` })
    .from(tasks)
    .where(
      and(
        eq(tasks.goalId, taskGoalId),
        eq(tasks.userId, userId),
        isNull(tasks.deletedAt),
        notInArray(tasks.status, CLOSED_TASK_STATUSES)
      )
    );
  return open === 0 ? { id: goal.id, title: goal.title } : null;
}

/**
 * Goals with the numbers every goal surface shows: step counts, steps done
 * this week (in the user's timezone) and the next open step.
 */
export async function attachGoalStats<G extends { id: string }>(
  userId: string,
  goalRows: G[],
  timezone: string
) {
  const [counts, nextSteps] = await Promise.all([
    getGoalTaskCounts(userId, startOfWeekInTimezone(timezone)),
    getGoalNextSteps(userId, goalRows.map((g) => g.id)),
  ]);
  const countsById = new Map(counts.map((c) => [c.goalId, c]));
  return goalRows.map((g) => ({
    ...g,
    taskCount: countsById.get(g.id)?.total ?? 0,
    completedTaskCount: countsById.get(g.id)?.completed ?? 0,
    completedThisWeek: countsById.get(g.id)?.completedThisWeek ?? 0,
    nextStep: nextSteps.get(g.id) ?? null,
  }));
}

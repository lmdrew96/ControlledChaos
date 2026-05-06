import { db } from "../index";
import { goals, tasks } from "../schema";
import { eq, and, desc, isNull, sql } from "drizzle-orm";

// ============================================================
// Goals
// ============================================================
export async function getUserGoals(userId: string, status?: string) {
  const conditions = [eq(goals.userId, userId), isNull(goals.deletedAt)];
  if (status) {
    conditions.push(eq(goals.status, status));
  }
  return db
    .select()
    .from(goals)
    .where(and(...conditions))
    .orderBy(desc(goals.createdAt));
}

export async function getGoalById(goalId: string, userId: string) {
  const [goal] = await db
    .select()
    .from(goals)
    .where(and(eq(goals.id, goalId), eq(goals.userId, userId)))
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
  const [goal] = await db
    .insert(goals)
    .values({
      userId,
      title: data.title,
      description: data.description ?? null,
      targetDate: data.targetDate ?? null,
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
  }>
) {
  const [updated] = await db
    .update(goals)
    .set(data)
    .where(and(eq(goals.id, goalId), eq(goals.userId, userId)))
    .returning();
  return updated ?? null;
}

export async function deleteGoal(goalId: string, userId: string) {
  // Unlink tasks from this goal first
  await db
    .update(tasks)
    .set({ goalId: null })
    .where(and(eq(tasks.goalId, goalId), eq(tasks.userId, userId)));

  // Soft delete — set deletedAt instead of removing the row
  const [deleted] = await db
    .update(goals)
    .set({ deletedAt: new Date() })
    .where(and(eq(goals.id, goalId), eq(goals.userId, userId)))
    .returning();
  return deleted ?? null;
}

export async function getGoalTaskCounts(userId: string) {
  const rows = await db
    .select({
      goalId: tasks.goalId,
      total: sql<number>`count(*)::int`,
      completed: sql<number>`count(*) filter (where ${tasks.status} = 'completed')::int`,
    })
    .from(tasks)
    .where(and(eq(tasks.userId, userId), sql`${tasks.goalId} is not null`, isNull(tasks.deletedAt)))
    .groupBy(tasks.goalId);
  return rows as { goalId: string; total: number; completed: number }[];
}



import { db } from "../index";
import { taskActivity, tasks } from "../schema";
import { eq, and, asc, desc, ne, gte, lt, or, inArray, isNull, sql } from "drizzle-orm";
import type { ParsedTask } from "@/types";
import { startOfDayInTimezone } from "@/lib/timezone";

// ============================================================
// Tasks
// ============================================================
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
    goalId?: string | null;
    sourceEventId?: string | null;
    roomVisibility?: "none" | "category" | "title";
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
      goalId: params.goalId ?? null,
      sourceEventId: params.sourceEventId ?? null,
      ...(params.roomVisibility ? { roomVisibility: params.roomVisibility } : {}),
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
  parsedTasks: ParsedTask[]
) {
  if (parsedTasks.length === 0) return [];

  const values = parsedTasks.map((task, index) => ({
    userId,
    title: task.title,
    description: task.description ?? null,
    priority: task.priority,
    energyLevel: task.energyLevel,
    estimatedMinutes: task.estimatedMinutes ?? null,
    category: task.category ?? null,
    locationTags: task.locationTags?.length ? task.locationTags : null,
    deadline: task.deadline ? new Date(task.deadline) : null,
    sourceDumpId: dumpId,
    sortOrder: index,
  }));

  const created = await db.insert(tasks).values(values).returning();
  return created;
}

export async function getTasksByUser(
  userId: string,
  options?: { status?: string }
) {
  const conditions = [eq(tasks.userId, userId), isNull(tasks.deletedAt)];

  if (options?.status) {
    conditions.push(eq(tasks.status, options.status));
  } else {
    // By default, exclude cancelled tasks
    conditions.push(ne(tasks.status, "cancelled"));
  }

  return db
    .select()
    .from(tasks)
    .where(and(...conditions))
    .orderBy(asc(tasks.sortOrder), desc(tasks.createdAt));
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
    scheduledFor: Date | null;
    completedAt: Date | null;
    progressSteps: object[] | null;
    currentStepIndex: number;
    sortOrder: number | null;
    goalId: string | null;
    roomVisibility: string;
  }>
) {
  const [updated] = await db
    .update(tasks)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
    .returning();

  return updated;
}

export async function reorderTasks(
  userId: string,
  orderedIds: string[]
) {
  // Canonical batched-transaction pattern for the neon-http driver: sequential
  // tx.update() calls with no external awaits in between. See CLAUDE.md.
  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await tx
        .update(tasks)
        .set({ sortOrder: i, updatedAt: new Date() })
        .where(and(eq(tasks.id, orderedIds[i]), eq(tasks.userId, userId)));
    }
  });
}

export async function deleteTask(taskId: string, userId: string) {
  // Soft delete — set deletedAt instead of removing the row
  const [deleted] = await db
    .update(tasks)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
    .returning();

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
    .where(eq(taskActivity.userId, userId))
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
  return db
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
}



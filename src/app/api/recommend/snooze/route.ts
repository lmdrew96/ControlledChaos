import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getUser } from "@/lib/db/queries";
import { db } from "@/lib/db";
import { tasks, taskActivity } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getSnoozeDecision } from "@/lib/ai/snooze";
import { buildAIContext } from "@/lib/ai/context";
import type { Task } from "@/types";

/**
 * POST /api/recommend/snooze
 * Body: { taskId: string }
 *
 * Asks Haiku how long to snooze the task based on priority, deadline, and context.
 * Sets snoozedUntil on the task and logs a "snoozed" activity.
 * Returns { snoozeMinutes, reason, snoozedUntil }.
 */
export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { taskId } = (await request.json()) as { taskId?: string };
    if (!taskId) {
      return NextResponse.json({ error: "taskId is required" }, { status: 400 });
    }

    // Fetch the task (verify ownership)
    const [task] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
      .limit(1);

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Build full AI context for smarter snooze decisions
    const [user, aiCtx] = await Promise.all([
      getUser(userId),
      buildAIContext(userId),
    ]);
    const timezone = user?.timezone ?? "America/New_York";
    const currentTimeIso = aiCtx.currentTime;

    const taskForAI: Task = {
      id: task.id,
      title: task.title,
      description: task.description ?? null,
      status: task.status as Task["status"],
      priority: task.priority as Task["priority"],
      energyLevel: task.energyLevel as Task["energyLevel"],
      estimatedMinutes: task.estimatedMinutes ?? null,
      category: task.category ?? null,
      locationTags: (task.locationTags as string[] | null) ?? null,
      deadline: task.deadline ? task.deadline.toISOString() : null,
      scheduledFor: task.scheduledFor ? task.scheduledFor.toISOString() : null,
      completedAt: task.completedAt ? task.completedAt.toISOString() : null,
      sourceDumpId: task.sourceDumpId ?? null,
      sourceEventId: task.sourceEventId ?? null,
      goalId: task.goalId ?? null,
      progressSteps: (task.progressSteps as import("@/types").ProgressStep[] | null) ?? null,
      currentStepIndex: task.currentStepIndex ?? 0,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    };

    // Ask Haiku with full situational context
    const { snoozeMinutes, reason } = await getSnoozeDecision(taskForAI, {
      currentTimeIso,
      timezone,
      aiContextBlock: aiCtx.formatted,
    });

    const snoozedUntil = new Date(Date.now() + snoozeMinutes * 60_000);

    // Persist: set snoozedUntil + status = snoozed
    await db
      .update(tasks)
      .set({ snoozedUntil, status: "snoozed", updatedAt: new Date() })
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));

    // Log activity
    await db.insert(taskActivity).values({
      userId,
      taskId,
      action: "snoozed",
    });

    return NextResponse.json({ snoozeMinutes, reason, snoozedUntil: snoozedUntil.toISOString() });
  } catch (error) {
    console.error("[API] POST /api/recommend/snooze error:", error);
    return NextResponse.json({ error: "Failed to snooze task" }, { status: 500 });
  }
}

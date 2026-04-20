import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { callHaiku } from "@/lib/ai";
import { TASK_CHUNKING_PROMPT } from "@/lib/ai/prompts";
import { extractJSON } from "@/lib/ai/validate";
import { buildAIContext } from "@/lib/ai/context";
import { db } from "@/lib/db";
import { tasks } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import type { ProgressStep } from "@/types";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_req: Request, context: RouteContext) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;

    // Fetch the task
    const [task] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
      .limit(1);

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Reject if already chunked
    if (task.progressSteps && (task.progressSteps as unknown[]).length > 0) {
      return NextResponse.json(
        { error: "Task already has progress steps" },
        { status: 400 }
      );
    }

    // Build context
    const aiCtx = await buildAIContext(userId);

    const lines = [
      `Task: "${task.title}"`,
      task.description ? `Description: ${task.description}` : null,
      `Estimated time: ${task.estimatedMinutes ?? 30} minutes`,
      `Energy level: ${task.energyLevel}`,
      task.category ? `Category: ${task.category}` : null,
      `Priority: ${task.priority}`,
      task.deadline ? `Deadline: ${task.deadline.toISOString()}` : null,
      `\n${aiCtx.formatted}`,
    ]
      .filter(Boolean)
      .join("\n");

    const result = await callHaiku({
      system: TASK_CHUNKING_PROMPT,
      user: lines,
      maxTokens: 1024,
    });

    let parsed: { steps: ProgressStep[] };
    try {
      parsed = extractJSON(result.text);
    } catch {
      return NextResponse.json(
        { error: "AI returned invalid response" },
        { status: 500 }
      );
    }

    if (
      !Array.isArray(parsed.steps) ||
      parsed.steps.length < 2 ||
      parsed.steps.length > 10
    ) {
      return NextResponse.json(
        { error: "AI returned unexpected step count" },
        { status: 500 }
      );
    }

    // Sanitize steps
    const steps: ProgressStep[] = parsed.steps
      .filter((s) => s.title?.trim())
      .map((s) => ({
        title: s.title.trim(),
        estimatedMinutes: Math.max(1, Math.round(s.estimatedMinutes ?? 10)),
      }));

    // Save steps on the task
    const [updated] = await db
      .update(tasks)
      .set({
        progressSteps: steps,
        currentStepIndex: 0,
        updatedAt: new Date(),
      })
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
      .returning();

    return NextResponse.json({ task: updated, steps });
  } catch (error) {
    console.error("[API] POST /api/tasks/[id]/chunk error:", error);
    return NextResponse.json(
      { error: "Failed to chunk task" },
      { status: 500 }
    );
  }
}

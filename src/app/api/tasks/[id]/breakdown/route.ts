import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { callHaiku } from "@/lib/ai";
import { TASK_BREAKDOWN_PROMPT } from "@/lib/ai/prompts";
import { extractJSON } from "@/lib/ai/validate";
import { buildAIContext } from "@/lib/ai/context";
import { db } from "@/lib/db";
import { tasks } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

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

    // Fetch the parent task
    const [task] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
      .limit(1);

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Build full AI context + task details
    const aiCtx = await buildAIContext(userId);

    const lines = [`Task: ${task.title}`];
    if (task.description) lines.push(`Description: ${task.description}`);
    if (task.estimatedMinutes) lines.push(`Estimated time: ${task.estimatedMinutes} minutes`);
    if (task.category) lines.push(`Category: ${task.category}`);
    lines.push(`Priority: ${task.priority}`);
    if (task.deadline) lines.push(`Deadline: ${task.deadline.toISOString()}`);
    lines.push(`\n${aiCtx.formatted}`);

    const result = await callHaiku({
      system: TASK_BREAKDOWN_PROMPT,
      user: lines.join("\n"),
      maxTokens: 1024,
    });

    let parsed: { subtasks: Array<{ title: string; description?: string; estimatedMinutes?: number; energyLevel?: string }> };
    try {
      parsed = extractJSON(result.text);
    } catch {
      return NextResponse.json({ error: "AI returned invalid response" }, { status: 500 });
    }

    if (!Array.isArray(parsed.subtasks) || parsed.subtasks.length === 0) {
      return NextResponse.json({ error: "AI could not break down this task" }, { status: 500 });
    }

    // Create subtasks inheriting parent's priority, category, locationTags
    const subtaskValues = parsed.subtasks
      .filter((s) => s.title?.trim())
      .map((s) => ({
        userId,
        parentTaskId: task.id,
        title: s.title.trim(),
        description: s.description ?? null,
        priority: task.priority,
        energyLevel: s.energyLevel ?? task.energyLevel,
        estimatedMinutes: s.estimatedMinutes ?? null,
        category: task.category,
        locationTags: task.locationTags,
        deadline: task.deadline,
      }));

    const created = await db.insert(tasks).values(subtaskValues).returning();

    return NextResponse.json({ subtasks: created });
  } catch (error) {
    console.error("[API] POST /api/tasks/[id]/breakdown error:", error);
    return NextResponse.json({ error: "Failed to break down task" }, { status: 500 });
  }
}

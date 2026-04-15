import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getTasksByUser, createTask, updateTask } from "@/lib/db/queries";
import { callHaiku } from "@/lib/ai";
import { AUTO_NOTE_TASK_SYSTEM_PROMPT } from "@/lib/ai/prompts";
import { buildAIContext } from "@/lib/ai/context";

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const status = request.nextUrl.searchParams.get("status") ?? undefined;
    const tasks = await getTasksByUser(userId, { status });

    return NextResponse.json({ tasks });
  } catch (error) {
    console.error("[API] GET /api/tasks error:", error);
    return NextResponse.json(
      { error: "Failed to fetch tasks" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { title, description, priority, energyLevel, estimatedMinutes, category, locationTags, deadline } = body;

    if (!title?.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const task = await createTask(userId, {
      title: title.trim(),
      description: description || null,
      priority,
      energyLevel,
      estimatedMinutes: estimatedMinutes ? parseInt(estimatedMinutes) : null,
      category: category || null,
      locationTags: locationTags?.length ? locationTags : null,
      deadline: deadline ? new Date(deadline) : null,
    });

    // Generate AI note if no description was provided
    if (!description) {
      const aiCtx = await buildAIContext(userId);
      const userPrompt = [
        `Task: "${task.title}"`,
        task.category ? `Category: ${task.category}` : null,
        task.priority !== "normal" ? `Priority: ${task.priority}` : null,
        task.deadline ? `Deadline: ${task.deadline.toISOString()}` : null,
        `\n${aiCtx.formatted}`,
      ]
        .filter(Boolean)
        .join(", ");

      try {
        const { text } = await callHaiku({
          system: AUTO_NOTE_TASK_SYSTEM_PROMPT,
          user: userPrompt,
          maxTokens: 200,
        });
        const raw = text.trim();

        // Parse AI time estimate from the EST: <number> line
        const estMatch = raw.match(/EST:\s*(\d+)/);
        const aiEstimate = estMatch ? Math.max(5, parseInt(estMatch[1], 10)) : null;

        // Strip EST line from the note text
        const note = raw.replace(/\n?EST:\s*\d+\s*$/, "").trim();

        const updates: Record<string, unknown> = {};
        if (note && note !== "SKIP") {
          updates.description = note;
        }
        // Only use AI estimate if user didn't provide one
        if (aiEstimate && !task.estimatedMinutes) {
          updates.estimatedMinutes = aiEstimate;
        }

        if (Object.keys(updates).length > 0) {
          await updateTask(task.id, userId, updates);
          if (updates.description) task.description = updates.description as string;
          if (updates.estimatedMinutes) task.estimatedMinutes = updates.estimatedMinutes as number;
        }
      } catch (err) {
        console.error("[AutoNote] Task note generation failed:", err);
      }
    }

    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    console.error("[API] POST /api/tasks error:", error);
    return NextResponse.json(
      { error: "Failed to create task" },
      { status: 500 }
    );
  }
}

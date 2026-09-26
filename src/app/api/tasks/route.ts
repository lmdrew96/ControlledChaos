import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getTasksByUser, createTask, updateTask, getGoal } from "@/lib/db/queries";
import { callHaiku } from "@/lib/ai";
import { trimIncompleteTail } from "@/lib/ai/validate";
import { AUTO_NOTE_TASK_SYSTEM_PROMPT } from "@/lib/ai/prompts";
import { buildAIContext } from "@/lib/ai/context";
import { formatForDisplay, DISPLAY_DATETIME } from "@/lib/timezone";
import { parseTaskUpdate, type TaskUpdateField } from "@/lib/db/task-update-fields";

/** What a create may set. Parsed with the PATCH guards (task-update-fields). */
const CREATE_FIELDS = [
  "title",
  "description",
  "priority",
  "energyLevel",
  "estimatedMinutes",
  "category",
  "locationTags",
  "deadline",
  "targetDate",
  "goalId",
] as const satisfies readonly TaskUpdateField[];

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const params = request.nextUrl.searchParams;
    const status = params.get("status") ?? undefined;
    const includeCancelled = params.get("includeCancelled") === "1";
    const tasks = await getTasksByUser(userId, { status, includeCancelled });

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
    if (typeof body?.title !== "string" || !body.title.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    // Same field guards as PATCH, so enums and numbers are validated once.
    const parsed = parseTaskUpdate(
      Object.fromEntries(CREATE_FIELDS.map((k) => [k, body[k]]))
    );
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const f = parsed.data;
    // The FK only proves the goal row exists — not that it's this user's, or live.
    if (f.goalId && !(await getGoal(f.goalId, userId))) {
      return NextResponse.json({ error: "Goal not found" }, { status: 400 });
    }
    const description = f.description ?? null;

    const task = await createTask(userId, {
      title: f.title!,
      description,
      priority: f.priority,
      energyLevel: f.energyLevel,
      estimatedMinutes: f.estimatedMinutes ?? null,
      category: f.category ?? null,
      locationTags: f.locationTags ?? null,
      deadline: f.deadline ?? null,
      targetDate: f.targetDate ?? null,
      goalId: f.goalId ?? null,
    });

    // Generate AI note if no description was provided
    if (!description) {
      const aiCtx = await buildAIContext(userId);
      const userPrompt = [
        `Task: "${task.title}"`,
        task.category ? `Category: ${task.category}` : null,
        task.priority !== "normal" ? `Priority: ${task.priority}` : null,
        task.deadline ? `Deadline: ${formatForDisplay(task.deadline, aiCtx.timezone, DISPLAY_DATETIME)}` : null,
        `\n${aiCtx.formatted}`,
      ]
        .filter(Boolean)
        .join(", ");

      try {
        const { text } = await callHaiku({
          system: AUTO_NOTE_TASK_SYSTEM_PROMPT,
          user: userPrompt,
          maxTokens: 200,
          label: "auto-note-task",
        });
        const raw = text.trim();

        // Parse AI time estimate from the EST: <number> line
        const estMatch = raw.match(/EST:\s*(\d+)/);
        const aiEstimate = estMatch ? Math.max(5, parseInt(estMatch[1], 10)) : null;

        // Strip EST line from the note text, then repair a max_tokens cut —
        // this string is saved as the task description and shown verbatim.
        const note = trimIncompleteTail(
          raw.replace(/\n?EST:\s*\d+\s*$/, "").trim()
        );

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

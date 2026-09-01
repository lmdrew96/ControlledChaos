import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { callHaiku, AIUnavailableError } from "@/lib/ai";
import { buildCrisisChatSystemPrompt, buildPersonalityBlock, formatCurrentDateTime } from "@/lib/ai/prompts";
import { buildAIContext } from "@/lib/ai/context";
import {
  getCrisisPlanById,
  getCrisisMessages,
  createCrisisMessage,
  getUserSettings,
  getUser,
  updateCrisisPlanDeadlines,
} from "@/lib/db/queries";
import { formatForDisplay, DISPLAY_DATETIME } from "@/lib/timezone";
import {
  CORRECT_PLAN_FACTS_TOOL,
  resolveCorrection,
} from "@/lib/ai/crisis-correction";
import type { CrisisTask, PersonalityPrefs } from "@/types";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** Conversation turns kept in context. Older turns fall off the front. */
const HISTORY_TURNS = 20;

/**
 * GET /api/crisis/[id]/chat
 * Fetch chat history for a crisis plan.
 */
export async function GET(_req: Request, context: RouteContext) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;

    const plan = await getCrisisPlanById(id, userId);
    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    const messages = await getCrisisMessages(id, userId);

    return NextResponse.json({
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("[API] GET /api/crisis/[id]/chat error:", error);
    return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 });
  }
}

/**
 * POST /api/crisis/[id]/chat
 * Send a message in crisis chat. Returns the AI response, and applies any
 * deadline correction the user stated.
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await request.json();
    const { message } = body as { message?: string };

    if (!message?.trim()) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    if (message.length > 2000) {
      return NextResponse.json({ error: "Message too long (max 2000 chars)" }, { status: 400 });
    }

    const [plan, existingMessages, settings, user, aiCtx] = await Promise.all([
      getCrisisPlanById(id, userId),
      getCrisisMessages(id, userId),
      getUserSettings(userId),
      getUser(userId),
      buildAIContext(userId, { skipCrises: true }),
    ]);

    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    if (plan.completedAt) {
      return NextResponse.json({ error: "This crisis plan is already completed" }, { status: 400 });
    }

    const timezone = user?.timezone ?? "America/New_York";

    const userMsg = await createCrisisMessage({
      crisisPlanId: id,
      userId,
      role: "user",
      content: message.trim(),
    });

    // Real message turns, not a flattened transcript. Role attribution is what
    // lets the model tell what the USER said from what it said back — flattening
    // it into one user-role blob is why stated corrections kept losing to the
    // system prompt.
    const history: Anthropic.MessageParam[] = existingMessages
      .slice(-HISTORY_TURNS)
      .map((m) => ({
        role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
        content: m.content,
      }));
    history.push({ role: "user", content: message.trim() });

    const personalityPrefs = (settings?.personalityPrefs as PersonalityPrefs | null) ?? null;
    const systemPrompt = buildCrisisChatSystemPrompt(buildPersonalityBlock(personalityPrefs));

    const buildCrisisContext = (
      deadline: Date | null,
      targetDate: Date | null
    ): string => {
      const tasks = plan.tasks as CrisisTask[];
      const currentTask = tasks[plan.currentTaskIndex] ?? null;

      // Hard and soft are stated separately and labeled. Merging them is what
      // let the assistant call a self-imposed date "due" and argue about it.
      const deadlineLines: string[] = [];
      if (deadline) {
        const mins = Math.max(0, Math.round((deadline.getTime() - Date.now()) / 60000));
        deadlineLines.push(
          `- HARD deadline (externally imposed): ${formatForDisplay(deadline, timezone, DISPLAY_DATETIME)} — ${mins} minutes away`
        );
      } else {
        deadlineLines.push(
          "- HARD deadline: NONE. There is no external deadline on this work. Do not invent urgency, and never suggest contacting anyone about it."
        );
      }
      if (targetDate) {
        deadlineLines.push(
          `- SELF-IMPOSED target (the user's own, fully moveable): ${formatForDisplay(targetDate, timezone, DISPLAY_DATETIME)}`
        );
      }

      return `## Current Date and Time
${formatCurrentDateTime(timezone)}

## Active Crisis Plan
- Task: "${plan.taskName}"
${deadlineLines.join("\n")}
- Panic level: ${plan.panicLevel} (${plan.panicLabel})
- Progress: ${plan.currentTaskIndex}/${tasks.length} steps done

${currentTask ? `## Current Step (#${plan.currentTaskIndex + 1})
- Title: ${currentTask.title}
- Instruction: ${currentTask.instruction}
- Estimated: ${currentTask.estimatedMinutes} min
- Stuck hint: ${currentTask.stuckHint}` : "All steps completed!"}

## Remaining Steps
${tasks.slice(plan.currentTaskIndex + 1).map((t, i) => `${plan.currentTaskIndex + 2 + i}. ${t.title} (${t.estimatedMinutes} min)`).join("\n") || "None — this is the last step!"}

${aiCtx.formatted}`;
    };

    const first = await callHaiku({
      system: `${systemPrompt}\n\n${buildCrisisContext(plan.deadline, plan.targetDate)}`,
      messages: history,
      tools: [CORRECT_PLAN_FACTS_TOOL],
      maxTokens: 700,
    });

    let aiResponse = first.text;
    let correctionApplied: string | null = null;

    const toolUse = first.content.find(
      (b): b is Anthropic.ToolUseBlock =>
        b.type === "tool_use" && b.name === "correct_plan_facts"
    );

    if (toolUse) {
      const correction = resolveCorrection(toolUse.input, timezone);

      if (correction.apply) {
        const updated = await updateCrisisPlanDeadlines(id, userId, {
          deadline: correction.deadline,
          targetDate: correction.targetDate,
        });
        if (updated) {
          correctionApplied = correction.summary;
          console.log(`[Crisis] Plan ${id} corrected: ${correctionApplied}`);
        }
      } else {
        console.warn(
          `[Crisis] Plan ${id}: correct_plan_facts rejected (${correction.reason}); plan left unchanged.`
        );
      }

      // Continue the turn with the tool result so the reply reflects the
      // corrected world. Rebuilt context, not the stale row.
      const followUp = await callHaiku({
        system: `${systemPrompt}\n\n${buildCrisisContext(
          correction.apply ? correction.deadline : plan.deadline,
          correction.apply ? correction.targetDate : plan.targetDate
        )}`,
        messages: [
          ...history,
          { role: "assistant", content: first.content },
          {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: toolUse.id,
                content: correction.apply
                  ? "Saved. The plan now reflects this. Reply to the user acknowledging it briefly and recalibrating the urgency — do not re-state the old deadline."
                  : "Could not save — the date was unclear. Ask the user for the specific date and time, without pressuring them.",
              },
            ],
          },
        ],
        tools: [CORRECT_PLAN_FACTS_TOOL],
        maxTokens: 700,
      });

      if (followUp.text) aiResponse = followUp.text;
    }

    if (!aiResponse) {
      aiResponse = "I'm here — what do you need?";
    }

    const assistantMsg = await createCrisisMessage({
      crisisPlanId: id,
      userId,
      role: "assistant",
      content: aiResponse,
    });

    return NextResponse.json({
      userMessage: {
        id: userMsg.id,
        role: "user",
        content: userMsg.content,
        createdAt: userMsg.createdAt.toISOString(),
      },
      assistantMessage: {
        id: assistantMsg.id,
        role: "assistant",
        content: aiResponse,
        createdAt: assistantMsg.createdAt.toISOString(),
      },
      /** Set when the assistant recorded a deadline correction this turn. */
      correctionApplied,
    });
  } catch (error) {
    console.error("[API] POST /api/crisis/[id]/chat error:", error);
    if (error instanceof AIUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
}

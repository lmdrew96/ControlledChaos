import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { callHaiku, AIUnavailableError } from "@/lib/ai";
import { buildCrisisChatSystemPrompt, buildPersonalityBlock } from "@/lib/ai/prompts";
import { buildAIContext } from "@/lib/ai/context";
import {
  getCrisisPlanById,
  getCrisisMessages,
  createCrisisMessage,
  getUserSettings,
} from "@/lib/db/queries";
import type { CrisisTask, PersonalityPrefs } from "@/types";

interface RouteContext {
  params: Promise<{ id: string }>;
}

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

    // Verify plan ownership
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
 * Send a message in crisis chat. Returns AI response.
 * Body: { message: string }
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

    // Fetch plan, chat history, settings, and AI context in parallel
    const [plan, existingMessages, settings, aiCtx] = await Promise.all([
      getCrisisPlanById(id, userId),
      getCrisisMessages(id, userId),
      getUserSettings(userId),
      buildAIContext(userId, { skipCrises: true }), // we already have the plan
    ]);

    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    if (plan.completedAt) {
      return NextResponse.json({ error: "This crisis plan is already completed" }, { status: 400 });
    }

    // Save user message
    const userMsg = await createCrisisMessage({
      crisisPlanId: id,
      userId,
      role: "user",
      content: message.trim(),
    });

    // Build conversation history for the AI (last 20 messages to control token usage)
    const recentMessages = existingMessages.slice(-20);
    const conversationHistory = recentMessages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));
    // Add the new user message
    conversationHistory.push({ role: "user", content: message.trim() });

    // Build system prompt with personality
    const personalityPrefs = (settings?.personalityPrefs as PersonalityPrefs | null) ?? null;
    const personalityBlock = buildPersonalityBlock(personalityPrefs);
    const systemPrompt = buildCrisisChatSystemPrompt(personalityBlock);

    // Build crisis context for the AI
    const tasks = plan.tasks as CrisisTask[];
    const currentTask = tasks[plan.currentTaskIndex] ?? null;
    const completedCount = plan.currentTaskIndex;

    const minutesUntilDeadline = Math.max(
      0,
      Math.round((new Date(plan.deadline).getTime() - Date.now()) / 60000)
    );

    const crisisContext = `## Active Crisis Plan
- Task: "${plan.taskName}"
- Deadline: ${minutesUntilDeadline} minutes away
- Panic level: ${plan.panicLevel} (${plan.panicLabel})
- Progress: ${completedCount}/${tasks.length} steps done

${currentTask ? `## Current Step (#${plan.currentTaskIndex + 1})
- Title: ${currentTask.title}
- Instruction: ${currentTask.instruction}
- Estimated: ${currentTask.estimatedMinutes} min
- Stuck hint: ${currentTask.stuckHint}` : "All steps completed!"}

## Remaining Steps
${tasks.slice(plan.currentTaskIndex + 1).map((t, i) => `${plan.currentTaskIndex + 2 + i}. ${t.title} (${t.estimatedMinutes} min)`).join("\n") || "None — this is the last step!"}

${aiCtx.formatted}`;

    // Call AI with full conversation
    const result = await callHaiku({
      system: `${systemPrompt}\n\n${crisisContext}`,
      user: conversationHistory.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n\n"),
      maxTokens: 512,
    });

    const aiResponse = result.text.trim();

    // Save AI response
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
    });
  } catch (error) {
    console.error("[API] POST /api/crisis/[id]/chat error:", error);
    if (error instanceof AIUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
}

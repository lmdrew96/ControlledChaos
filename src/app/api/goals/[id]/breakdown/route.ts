import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { AIUnavailableError, callHaiku } from "@/lib/ai";
import { GOAL_BREAKDOWN_PROMPT, formatCurrentDateTime } from "@/lib/ai/prompts";
import { extractJSON } from "@/lib/ai/validate";
import { getGoal, getGoalTasks, getUser } from "@/lib/db/queries";
import { formatDateOnly } from "@/lib/timezone";
import type { EnergyLevel, SuggestedGoalStep } from "@/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ENERGY_LEVELS = new Set<EnergyLevel>(["low", "medium", "high"]);

/**
 * Suggest starter steps for a goal. Writes nothing — the client creates the
 * steps the user picks, through the normal task create.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const goal = UUID.test(id) ? await getGoal(id, userId) : null;
    if (!goal) {
      return NextResponse.json({ error: "Goal not found" }, { status: 404 });
    }

    const [linked, user] = await Promise.all([getGoalTasks(id, userId), getUser(userId)]);
    const timezone = user?.timezone ?? "America/New_York";
    const existing = linked
      .filter((t) => t.status !== "cancelled")
      .map((t) => `- ${t.title} (${t.status === "completed" ? "done" : "open"})`);

    const prompt = [
      `[Current date and time: ${formatCurrentDateTime(timezone)}]`,
      `Goal: "${goal.title}"`,
      goal.description ? `Description: ${goal.description}` : null,
      goal.targetDate ? `Target day: ${formatDateOnly(goal.targetDate)}` : null,
      `Steps already linked:\n${existing.length > 0 ? existing.join("\n") : "None yet"}`,
    ]
      .filter(Boolean)
      .join("\n");

    const result = await callHaiku({
      system: GOAL_BREAKDOWN_PROMPT,
      user: prompt,
      maxTokens: 1024,
      label: "goal-breakdown",
      requireComplete: true,
    });

    let parsed: { steps?: unknown };
    try {
      parsed = extractJSON(result.text);
    } catch {
      return NextResponse.json({ error: "AI returned an invalid response" }, { status: 502 });
    }

    const steps: SuggestedGoalStep[] = (Array.isArray(parsed.steps) ? parsed.steps : [])
      .filter(
        (s): s is Record<string, unknown> =>
          !!s && typeof s === "object" && typeof (s as { title?: unknown }).title === "string"
      )
      .map((s) => ({
        title: (s.title as string).trim().slice(0, 500),
        description:
          typeof s.description === "string" && s.description.trim()
            ? s.description.trim().slice(0, 1000)
            : null,
        estimatedMinutes:
          typeof s.estimatedMinutes === "number" && s.estimatedMinutes > 0
            ? Math.min(240, Math.round(s.estimatedMinutes))
            : 30,
        energyLevel: ENERGY_LEVELS.has(s.energyLevel as EnergyLevel)
          ? (s.energyLevel as EnergyLevel)
          : "medium",
      }))
      .filter((s) => s.title.length > 0)
      .slice(0, 5);

    if (steps.length === 0) {
      return NextResponse.json({ error: "No steps came back — try again" }, { status: 502 });
    }

    return NextResponse.json({ steps });
  } catch (error) {
    console.error("[API] POST /api/goals/:id/breakdown error:", error);
    if (error instanceof AIUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    return NextResponse.json({ error: "Failed to break down goal" }, { status: 500 });
  }
}

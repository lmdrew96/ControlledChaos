import { callHaiku } from "@/lib/ai";
import { CRISIS_SYSTEM_PROMPT } from "@/lib/ai/prompts";
import { extractJSON } from "@/lib/ai/validate";
import type { CrisisPlan, CrisisStrategy, CrisisFileAttachment } from "@/types";

// ============================================================
// Types
// ============================================================

export interface CrisisParams {
  taskName: string;
  deadline: string;
  completionPct: number;
  currentTime: string;
  minutesUntilDeadline: number;
  sleepSchedule?: { wakeTime: number; sleepTime: number; sleepMinutesBlocked: number };
  upcomingEvents: Array<{ title: string; startTime: string; endTime: string; durationMinutes: number }>;
  existingPendingTaskCount: number;
  activeCrises?: Array<{ taskName: string; deadline: string; panicLevel: string; progressPct: number }>;
  completedSteps?: string[];
  currentLocation?: string | null;
  commuteContext?: Array<{ to: string; minutes: number }>;
  files?: CrisisFileAttachment[];
  /** Supplementary context (energy, behavior patterns) from buildAIContext() */
  aiContextBlock?: string;
}

// ============================================================
// Fallback plan (when AI parse fails)
// ============================================================

const FALLBACK_PLAN: CrisisPlan = {
  panicLevel: "tight",
  panicLabel: "Tight but doable",
  summary: "AI assessment unavailable. Start with the smallest possible step.",
  tasks: [
    {
      title: "Start somewhere",
      instruction:
        "Pick the smallest piece of this task and do just that. You can figure out the rest as you go.",
      estimatedMinutes: 20,
      stuckHint:
        "Open a blank doc and write one sentence about what you need to accomplish.",
    },
  ],
};

// ============================================================
// User prompt builder
// ============================================================

function buildUserPrompt(params: CrisisParams): string {
  const eventsText =
    params.upcomingEvents.length > 0
      ? params.upcomingEvents
          .map((e) => `- ${e.title}: ${e.startTime} – ${e.endTime} (${e.durationMinutes} min)`)
          .join("\n")
      : "None";

  const totalEventMinutes = params.upcomingEvents.reduce((sum, e) => sum + e.durationMinutes, 0);
  const sleepMinutes = params.sleepSchedule?.sleepMinutesBlocked ?? 0;
  const totalBlockedMinutes = totalEventMinutes + sleepMinutes;
  const availableMinutes = Math.max(0, params.minutesUntilDeadline - totalBlockedMinutes);

  const fmtHour = (h: number) => {
    const period = h >= 12 ? "PM" : "AM";
    const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${display} ${period}`;
  };

  const sleepLine = params.sleepSchedule
    ? `\nUser's sleep schedule: ${fmtHour(params.sleepSchedule.sleepTime)} – ${fmtHour(params.sleepSchedule.wakeTime)} (${(sleepMinutes / 60).toFixed(1)}h blocked for sleep between now and deadline)`
    : "";

  const timeBudgetLine = `\nTime budget: ${params.minutesUntilDeadline} min total – ${totalEventMinutes} min events – ${sleepMinutes} min sleep = ${availableMinutes} min (${(availableMinutes / 60).toFixed(1)}h) of actual work time`;

  const crisesText =
    params.activeCrises && params.activeCrises.length > 0
      ? params.activeCrises
          .map((c) => `- "${c.taskName}" due ${c.deadline} (${c.panicLevel}, ${c.progressPct}% done)`)
          .join("\n")
      : "None";

  const completedStepsText =
    params.completedSteps && params.completedSteps.length > 0
      ? `\n\nSteps already completed (DO NOT regenerate these — only plan the REMAINING work):\n${params.completedSteps.map((s, i) => `${i + 1}. ✅ ${s}`).join("\n")}`
      : "";

  let locationLine = "";
  if (params.currentLocation) {
    const commuteInfo = params.commuteContext && params.commuteContext.length > 0
      ? `\nKnown commute times from ${params.currentLocation}: ${params.commuteContext.map((c) => `→ ${c.to}: ${c.minutes} min`).join(", ")}.`
      : "";
    locationLine = `\nUser's current location: ${params.currentLocation}. If the task requires being somewhere else, you MUST include a "Leave for [destination]" step with the commute time. The user needs to arrive BEFORE the deadline, not at the deadline.${commuteInfo}`;
  }

  return `Task: ${params.taskName}
Deadline: ${params.deadline}
Current time: ${params.currentTime}
Minutes until deadline: ${params.minutesUntilDeadline}
Already completed: ~${params.completionPct}%
Other pending tasks (context): ${params.existingPendingTaskCount}${locationLine}

Other active crisis plans this user is juggling:
${crisesText}

Upcoming events that may interrupt:
${eventsText}${sleepLine}${timeBudgetLine}
${completedStepsText}
Break this into concrete micro-tasks that fit the remaining time. Be honest about urgency.${params.aiContextBlock ? `\n\n${params.aiContextBlock}` : ""}`;
}

// ============================================================
// Main export
// ============================================================

export type CrisisResult =
  | { type: "plan"; plan: CrisisPlan }
  | { type: "strategies"; strategies: CrisisStrategy[] };

export async function getCrisisPlan(params: CrisisParams): Promise<CrisisResult> {
  const userPromptText = buildUserPrompt(params);

  try {
    let responseText: string;

    if (params.files && params.files.length > 0) {
      // Multimodal path — pass content blocks through callHaiku
      type ImageMediaType = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

      const fileBlocks = params.files.map((f) => {
        if (f.mediaType.startsWith("image/")) {
          return {
            type: "image" as const,
            source: {
              type: "base64" as const,
              media_type: f.mediaType as ImageMediaType,
              data: f.base64,
            },
          };
        }
        return {
          type: "document" as const,
          source: {
            type: "base64" as const,
            media_type: "application/pdf" as const,
            data: f.base64,
          },
        };
      });

      const result = await callHaiku({
        system: CRISIS_SYSTEM_PROMPT,
        user: [
          ...fileBlocks,
          { type: "text" as const, text: userPromptText },
        ],
        maxTokens: 4096,
      });
      responseText = result.text;
    } else {
      // Text-only path — use callHaiku
      const result = await callHaiku({
        system: CRISIS_SYSTEM_PROMPT,
        user: userPromptText,
        maxTokens: 4096,
      });
      responseText = result.text;
    }

    // Try standard extraction first; fall back to bracket-scanning
    let parsed: Record<string, unknown>;
    try {
      parsed = extractJSON<Record<string, unknown>>(responseText);
    } catch {
      // extractJSON failed — try finding the outermost { ... } in the response
      const start = responseText.indexOf("{");
      const end = responseText.lastIndexOf("}");
      if (start === -1 || end === -1 || end <= start) {
        console.error("[AI] Crisis: no JSON object found in response:", responseText);
        return { type: "plan", plan: FALLBACK_PLAN };
      }
      try {
        parsed = JSON.parse(responseText.slice(start, end + 1)) as Record<string, unknown>;
      } catch (innerErr) {
        console.error("[AI] Crisis: bracket-scan parse failed:", innerErr, "\nRaw:", responseText);
        return { type: "plan", plan: FALLBACK_PLAN };
      }
    }

    // Determine if the AI returned strategies or a single plan
    if (Array.isArray(parsed.strategies) && parsed.strategies.length > 0) {
      const strategies: CrisisStrategy[] = parsed.strategies.map(
        (s: Record<string, unknown>) => ({
          label: String(s.label ?? "Strategy"),
          description: String(s.description ?? ""),
          plan: {
            panicLevel: s.panicLevel as CrisisPlan["panicLevel"],
            panicLabel: String(s.panicLabel ?? ""),
            summary: String(s.summary ?? ""),
            tasks: (s.tasks as CrisisPlan["tasks"]) ?? [],
          },
        })
      );
      return { type: "strategies", strategies };
    }

    // Extract optional questions field
    const plan = parsed as unknown as CrisisPlan;
    if (Array.isArray(parsed.questions)) {
      plan.questions = (parsed.questions as string[]).filter(
        (q) => typeof q === "string" && q.trim().length > 0
      );
    }

    return { type: "plan", plan };
  } catch (error) {
    console.error("[AI] Crisis: unexpected error:", error);
    return { type: "plan", plan: FALLBACK_PLAN };
  }
}

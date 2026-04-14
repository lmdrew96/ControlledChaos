import { anthropic, callHaiku, callWithRetry } from "@/lib/ai";
import { CRISIS_SYSTEM_PROMPT } from "@/lib/ai/prompts";
import { extractJSON } from "@/lib/ai/validate";
import type { CrisisPlan, CrisisFileAttachment } from "@/types";

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
Break this into concrete micro-tasks that fit the remaining time. Be honest about urgency.`;
}

// ============================================================
// Main export
// ============================================================

export async function getCrisisPlan(params: CrisisParams): Promise<CrisisPlan> {
  const userPromptText = buildUserPrompt(params);

  try {
    let responseText: string;

    if (params.files && params.files.length > 0) {
      // Multimodal path — call SDK directly with typed content blocks
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

      const content = [
        ...fileBlocks,
        { type: "text" as const, text: userPromptText },
      ];

      const response = await callWithRetry(() =>
        anthropic.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 2048,
          system: CRISIS_SYSTEM_PROMPT,
          messages: [{ role: "user", content }],
        })
      );

      responseText =
        response.content[0].type === "text" ? response.content[0].text : "";

      console.log(
        `[AI] Crisis multimodal: ${response.usage.input_tokens} in / ${response.usage.output_tokens} out`
      );
    } else {
      // Text-only path — use callHaiku
      const result = await callHaiku({
        system: CRISIS_SYSTEM_PROMPT,
        user: userPromptText,
        maxTokens: 2048,
      });
      responseText = result.text;
    }

    // Try standard extraction first; fall back to bracket-scanning if that fails
    let parsed: CrisisPlan;
    try {
      parsed = extractJSON<CrisisPlan>(responseText);
    } catch {
      // extractJSON failed — try finding the outermost { ... } in the response
      const start = responseText.indexOf("{");
      const end = responseText.lastIndexOf("}");
      if (start === -1 || end === -1 || end <= start) {
        console.error("[AI] Crisis: no JSON object found in response:", responseText);
        return FALLBACK_PLAN;
      }
      try {
        parsed = JSON.parse(responseText.slice(start, end + 1)) as CrisisPlan;
      } catch (innerErr) {
        console.error("[AI] Crisis: bracket-scan parse failed:", innerErr, "\nRaw:", responseText);
        return FALLBACK_PLAN;
      }
    }
    return parsed;
  } catch (error) {
    console.error("[AI] Crisis: unexpected error:", error);
    return FALLBACK_PLAN;
  }
}

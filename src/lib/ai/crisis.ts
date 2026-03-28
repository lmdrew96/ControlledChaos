import { anthropic, callHaiku, callWithRetry } from "@/lib/ai";
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
  upcomingEvents: Array<{ title: string; startTime: string; endTime: string }>;
  existingPendingTaskCount: number;
  files?: CrisisFileAttachment[];
}

// ============================================================
// System prompt
// ============================================================

const CRISIS_SYSTEM_PROMPT = `You are Crisis Mode — a calm, no-BS assistant for when someone is behind on something with a hard deadline. Break the task into 5-8 concrete micro-tasks (≤30 min each) that fit the available time. Be honest about how bad the situation is. Write each instruction as a direct, specific action (not vague). Include a stuckHint per task — a tip if they freeze on that step. No encouragement fluff. If the user has attached files (assignment instructions, rubrics, screenshots), use them to make the micro-tasks more specific and accurate to the actual requirements. Respond with ONLY valid JSON, no prose. Schema: { "panicLevel": "fine"|"tight"|"damage-control", "panicLabel": string, "summary": string, "tasks": [{ "title": string, "instruction": string, "estimatedMinutes": number, "stuckHint": string }] }`;

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
          .map((e) => `- ${e.title}: ${e.startTime} – ${e.endTime}`)
          .join("\n")
      : "None";

  return `Task: ${params.taskName}
Deadline: ${params.deadline}
Current time: ${params.currentTime}
Minutes until deadline: ${params.minutesUntilDeadline}
Already completed: ~${params.completionPct}%
Other pending tasks (context): ${params.existingPendingTaskCount}

Upcoming events that may interrupt:
${eventsText}

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
        maxTokens: 1024,
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

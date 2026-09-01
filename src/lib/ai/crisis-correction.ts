import type Anthropic from "@anthropic-ai/sdk";
import { toUTC } from "@/lib/timezone";

/**
 * The one thing the rescue assistant can change about the world.
 *
 * Deliberately narrow. It does not get to rewrite the plan, reorder steps, or
 * edit tasks — the UI already does all of that. It gets exactly the power it
 * was missing: recording that the user's deadline is not what the database
 * thought it was.
 */
export const CORRECT_PLAN_FACTS_TOOL: Anthropic.Tool = {
  name: "correct_plan_facts",
  description:
    "Record a correction the user has just made about their deadlines. Call this the moment the user tells you a deadline is self-imposed, that the real due date is different, or that there is no hard deadline at all. Calling this is what makes the correction STICK — without it you will be handed the same wrong deadline again on the very next message and will start pressuring them all over again. Call it once per correction, and still reply to the user normally in the same turn.",
  input_schema: {
    type: "object",
    properties: {
      hasHardDeadline: {
        type: "boolean",
        description:
          "True if a real, externally imposed deadline exists (an instructor, an employer, a submission portal). False if the only deadline is one the user set for themselves.",
      },
      hardDeadline: {
        type: "string",
        description:
          "The real external deadline in the user's LOCAL time as 'YYYY-MM-DDTHH:MM:SS' — no timezone suffix, no 'Z'. Required when hasHardDeadline is true. Omit entirely when it is false.",
      },
      selfImposedDeadline: {
        type: "string",
        description:
          "The date the user set for themselves, same 'YYYY-MM-DDTHH:MM:SS' local format. Include it when they still want to aim for it. Omit if they have dropped it.",
      },
      summary: {
        type: "string",
        description:
          "One short sentence describing the correction, in your own words. Example: 'Tonight's deadline was self-imposed; the real one is Friday at 5pm.'",
      },
    },
    required: ["hasHardDeadline", "summary"],
  },
};

export interface ResolvedCorrection {
  /** False means write nothing — the input could not be trusted. */
  apply: boolean;
  deadline: Date | null;
  targetDate: Date | null;
  summary: string;
  reason: "ok" | "unparseable_hard_deadline";
}

/** Parse a local "YYYY-MM-DDTHH:MM:SS" from the model into a UTC Date. */
function parseLocal(value: unknown, timezone: string): Date | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = new Date(toUTC(value, timezone));
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Turn a `correct_plan_facts` tool input into the exact write to perform.
 *
 * The one branch that matters: if the model claims a hard deadline exists but
 * gives an unusable date, we write NOTHING. Writing `deadline: null` there
 * would silently erase a real deadline on the strength of a malformed string —
 * the most damaging thing this feature could do.
 */
export function resolveCorrection(
  input: unknown,
  timezone: string
): ResolvedCorrection {
  const raw = (input ?? {}) as Record<string, unknown>;
  const hasHard = raw.hasHardDeadline === true;

  const deadline = hasHard ? parseLocal(raw.hardDeadline, timezone) : null;
  const targetDate = parseLocal(raw.selfImposedDeadline, timezone);
  const summary =
    typeof raw.summary === "string" && raw.summary.trim() !== ""
      ? raw.summary.trim()
      : "Deadline updated.";

  if (hasHard && deadline === null) {
    return {
      apply: false,
      deadline: null,
      targetDate: null,
      summary,
      reason: "unparseable_hard_deadline",
    };
  }

  return { apply: true, deadline, targetDate, summary, reason: "ok" };
}

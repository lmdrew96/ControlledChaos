import { callHaiku } from "./index";
import {
  buildBrainDumpSystemPrompt,
  VOICE_DUMP_ADDENDUM,
  PHOTO_DUMP_ADDENDUM,
  formatCurrentDateTime,
} from "./prompts";
import { extractJSON, validateISODate } from "./validate";
import { toUTC } from "@/lib/timezone";
import type { BrainDumpResult, DumpInputType, ParsedCalendarEvent, ParsedTask, PersonalityPrefs } from "@/types";

export interface BrainDumpContext {
  existingGoals: Array<{ title: string }>;
  existingTasks: Array<{ title: string }>;
  calendarSummary?: string;
  savedLocationNames?: string[];
  personalityPrefs?: PersonalityPrefs | null;
  /** Pre-formatted AI context block (energy, crises, behavior patterns) */
  aiContextBlock?: string;
}

export async function parseBrainDump(
  content: string,
  inputType: DumpInputType = "text",
  timezone: string = "America/New_York",
  context?: BrainDumpContext
): Promise<BrainDumpResult> {
  if (!content.trim()) {
    throw new Error("Brain dump content cannot be empty");
  }

  let system = buildBrainDumpSystemPrompt(context?.personalityPrefs ?? null);
  if (inputType === "voice") {
    system += VOICE_DUMP_ADDENDUM;
  } else if (inputType === "photo") {
    system += PHOTO_DUMP_ADDENDUM;
  }

  const currentDateTime = formatCurrentDateTime(timezone);

  // Build enriched user message with all available context
  const sections: string[] = [
    `[Current date and time: ${currentDateTime}]`,
    `[Timezone: ${timezone}]`,
  ];

  if (context?.existingGoals && context.existingGoals.length > 0) {
    sections.push(
      `\n## User's Existing Goals\n${context.existingGoals.map((g) => `- ${g.title}`).join("\n")}`
    );
  } else {
    sections.push("\n## User's Existing Goals\nNone set");
  }

  if (context?.existingTasks && context.existingTasks.length > 0) {
    // Cap at 30 to avoid token bloat
    const tasksToShow = context.existingTasks.slice(0, 30);
    sections.push(
      `\n## Current Pending Tasks\n${tasksToShow.map((t) => `- ${t.title}`).join("\n")}${
        context.existingTasks.length > 30
          ? `\n(and ${context.existingTasks.length - 30} more)`
          : ""
      }`
    );
  } else {
    sections.push("\n## Current Pending Tasks\nNone");
  }

  if (context?.savedLocationNames && context.savedLocationNames.length > 0) {
    sections.push(
      `\n## User's Saved Locations\n${context.savedLocationNames.map((n) => `- ${n}`).join("\n")}`
    );
  }

  if (context?.calendarSummary) {
    sections.push(`\n## Today's Calendar\n${context.calendarSummary}`);
  }

  if (context?.aiContextBlock) {
    sections.push(`\n${context.aiContextBlock}`);
  }

  sections.push(`\n## Brain Dump\n${content}`);

  const userMessage = sections.join("\n");

  const result = await callHaiku({
    system,
    user: userMessage,
    maxTokens: 4096,
  });

  let parsed: { tasks: ParsedTask[]; events?: ParsedCalendarEvent[]; summary: string };
  try {
    parsed = extractJSON(result.text);
  } catch {
    console.error("[AI] Failed to parse brain dump response:", result.text);
    throw new Error("AI returned invalid response. Please try again.");
  }

  if (!parsed.tasks || !Array.isArray(parsed.tasks)) {
    throw new Error("AI returned unexpected format. Please try again.");
  }

  // Build set of valid goal titles for goalConnection validation
  const validGoalTitles = new Set(
    (context?.existingGoals ?? []).map((g) => g.title.toLowerCase())
  );

  // Validate and sanitize each task
  const tasks: ParsedTask[] = parsed.tasks.map((task) => {
    // Validate goalConnection against real goals
    let goalConnection: string | undefined;
    if (task.goalConnection) {
      const matchesGoal = validGoalTitles.has(task.goalConnection.toLowerCase());
      if (matchesGoal) {
        // Find the properly-cased version
        goalConnection = (context?.existingGoals ?? []).find(
          (g) => g.title.toLowerCase() === task.goalConnection!.toLowerCase()
        )?.title;
      } else {
        console.warn(
          `[AI Validate] Discarded hallucinated goalConnection: "${task.goalConnection}"`
        );
      }
    }

    return {
      title: task.title || "Untitled task",
      description: task.description || undefined,
      priority: validateEnum(
        task.priority,
        ["urgent", "important", "normal", "someday"],
        "normal"
      ),
      energyLevel: validateEnum(
        task.energyLevel,
        ["low", "medium", "high"],
        "medium"
      ),
      estimatedMinutes: task.estimatedMinutes
        ? Math.max(1, Math.round(task.estimatedMinutes))
        : undefined,
      category: task.category
        ? validateEnum(
            task.category,
            ["school", "work", "personal", "errands", "health"],
            undefined
          )
        : undefined,
      locationTags: Array.isArray(task.locationTags)
        ? task.locationTags.filter(
            (t: string) =>
              typeof t === "string" &&
              t.length > 0 &&
              (!context?.savedLocationNames?.length ||
                context.savedLocationNames.some(
                  (n) => n.toLowerCase() === t.toLowerCase()
                ))
          )
        : undefined,
      deadline: validateISODate(task.deadline),
      goalConnection,
    };
  });

  // Validate and sanitize each calendar event
  const events: ParsedCalendarEvent[] = (parsed.events ?? [])
    .map((evt) => {
      // Convert AI-output local times to UTC (AI outputs local clock time, not UTC)
      const rawStart = toUTC(evt.startTime, timezone);
      const startTime = validateISODate(rawStart);
      if (!startTime) return null; // Skip events without valid start

      const rawEnd = toUTC(evt.endTime, timezone);
      const endTime =
        validateISODate(rawEnd) ||
        new Date(new Date(startTime).getTime() + 3600000).toISOString();

      const result: ParsedCalendarEvent = {
        title: evt.title || "Untitled Event",
        description: evt.description || undefined,
        location: evt.location || undefined,
        startTime,
        endTime,
        isAllDay: evt.isAllDay ?? false,
      };

      if (evt.recurrence && evt.recurrence.type) {
        const recType = validateEnum(
          evt.recurrence.type,
          ["daily", "weekly"],
          undefined
        );
        if (recType) {
          result.recurrence = {
            type: recType,
            daysOfWeek: Array.isArray(evt.recurrence.daysOfWeek)
              ? evt.recurrence.daysOfWeek.filter(
                  (d: number) => typeof d === "number" && d >= 0 && d <= 6
                )
              : undefined,
            endDate:
              validateISODate(toUTC(evt.recurrence.endDate ?? "", timezone)) ||
              // Default to 16 weeks from start for recurring events
              new Date(
                new Date(startTime).getTime() + 16 * 7 * 24 * 60 * 60 * 1000
              ).toISOString(),
          };
        }
      }

      return result;
    })
    .filter((evt): evt is ParsedCalendarEvent => evt !== null);

  return {
    tasks,
    events,
    summary:
      parsed.summary ||
      `Parsed ${tasks.length} task${tasks.length !== 1 ? "s" : ""}${events.length > 0 ? ` and ${events.length} event${events.length !== 1 ? "s" : ""}` : ""} from brain dump`,
  };
}

/**
 * Summarize a Junk Journal entry — no task or event extraction.
 *
 * Junk Journal is a longform-writing surface; the AI's only job here is to
 * produce a 1-2 sentence summary for the history list. Tasks/events extraction
 * would be noise for this content type.
 */
export async function summarizeJunkJournal(
  content: string
): Promise<string> {
  if (!content.trim()) {
    throw new Error("Junk journal content cannot be empty");
  }

  const system =
    "You summarize longform writing in 1-2 short sentences. " +
    "Capture the main idea, topic, or feeling — not an action or task. " +
    "No lists, no bullets, no JSON. Just the summary itself. " +
    "Max 200 characters.";

  const result = await callHaiku({
    system,
    user: content,
    maxTokens: 200,
  });

  const summary = result.text.trim().slice(0, 240);
  return summary || "Journal entry";
}

function validateEnum<T extends string>(
  value: string | undefined,
  allowed: T[],
  fallback: T
): T;
function validateEnum<T extends string>(
  value: string | undefined,
  allowed: T[],
  fallback: undefined
): T | undefined;
function validateEnum<T extends string>(
  value: string | undefined,
  allowed: T[],
  fallback: T | undefined
): T | undefined {
  if (value && allowed.includes(value as T)) {
    return value as T;
  }
  return fallback;
}

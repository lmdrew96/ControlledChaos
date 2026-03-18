import { callHaiku } from "./index";
import {
  BRAIN_DUMP_SYSTEM_PROMPT,
  VOICE_DUMP_ADDENDUM,
  PHOTO_DUMP_ADDENDUM,
  formatCurrentDateTime,
} from "./prompts";
import { extractJSON, validateISODate } from "./validate";
import type { BrainDumpResult, DumpInputType, ParsedCalendarEvent, ParsedTask } from "@/types";

export interface BrainDumpContext {
  existingGoals: Array<{ title: string }>;
  existingTasks: Array<{ title: string }>;
  calendarSummary?: string;
  savedLocationNames?: string[];
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

  let system = BRAIN_DUMP_SYSTEM_PROMPT;
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
      const rawStart = localIsoToUtc(evt.startTime, timezone);
      const startTime = validateISODate(rawStart);
      if (!startTime) return null; // Skip events without valid start

      const rawEnd = localIsoToUtc(evt.endTime, timezone);
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
              validateISODate(localIsoToUtc(evt.recurrence.endDate ?? "", timezone)) ||
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
 * Interpret an AI-output datetime string as local time in the given timezone
 * and return the correct UTC ISO string.
 *
 * The AI outputs clock times like "2026-03-17T09:00:00" or "2026-03-17T09:00:00.000Z"
 * but always means the user's local time. We strip any timezone suffix and convert
 * the local time to UTC using the user's timezone offset.
 */
function localIsoToUtc(localIso: string, timezone: string): string {
  if (!localIso) return "";

  // Strip any timezone suffix (Z, +HH:MM, -HH:MM) — treat as local clock time
  const naive = localIso.replace(/Z$|[+-]\d{2}:\d{2}$/, "");

  const [datePart, timePart = "00:00:00"] = naive.split("T");
  if (!datePart || !/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return localIso;

  const [year, month, day] = datePart.split("-").map(Number);
  const timeParts = timePart.split(":").map((s) => parseInt(s, 10));
  const hours = timeParts[0] ?? 0;
  const minutes = timeParts[1] ?? 0;
  const seconds = timeParts[2] ?? 0;

  // Treat the naive values as UTC to create a reference Date
  const approxUtc = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));

  // Ask the formatter: when it's `approxUtc` in UTC, what local time is it in `timezone`?
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(approxUtc);

  const get = (type: string) =>
    parseInt(parts.find((p) => p.type === type)!.value, 10);

  const localHour = get("hour") % 24; // hour12:false can give 24 for midnight
  const localMin = get("minute");
  const localSec = get("second");
  const localYear = get("year");
  const localMon = get("month");
  const localDay2 = get("day");

  // offset_ms = approxUtc - (what approxUtc looks like in local time, treated as UTC ms)
  // This equals the timezone's UTC offset (e.g., EDT = +4h = +14400000ms)
  const localAsUtcMs = Date.UTC(localYear, localMon - 1, localDay2, localHour, localMin, localSec);
  const offsetMs = approxUtc.getTime() - localAsUtcMs;

  // The correct UTC time = what the user said (as naive UTC ms) + the offset
  const wantedLocalMs = Date.UTC(year, month - 1, day, hours, minutes, seconds);
  return new Date(wantedLocalMs + offsetMs).toISOString();
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

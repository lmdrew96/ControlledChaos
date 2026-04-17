import { callHaiku } from "./index";
import { buildPersonalityBlock, buildTaskRecommendationPrompt } from "./prompts";
import { extractJSON, extractScratchpad } from "./validate";
import { getCalendarParts, formatForDisplay, DISPLAY_TIME } from "@/lib/timezone";
import type { UserContext, TaskRecommendation, Task, PersonalityPrefs } from "@/types";

interface RecommendationInput {
  context: UserContext;
  pendingTasks: Task[];
  recentlyRejectedTaskIds?: string[];
  personalityPrefs?: PersonalityPrefs | null;
  /** Supplementary context (crises, behavior patterns) from buildAIContext() */
  aiContextBlock?: string;
}

/**
 * Build the user prompt that provides all context to Haiku.
 */
function buildRecommendationPrompt(input: RecommendationInput): string {
  const { context, pendingTasks, recentlyRejectedTaskIds = [] } = input;

  const now = new Date();

  // Pre-compute relative time so the AI never does date math
  const relativeTime = (iso: string | null): string | null => {
    if (!iso) return null;
    const targetMs = new Date(iso).getTime();
    const diffMs = targetMs - now.getTime();
    const hoursLeft = Math.round(diffMs / 3_600_000);
    if (hoursLeft < -1) return `OVERDUE by ${Math.abs(hoursLeft)} hours`;
    if (hoursLeft < 0) return "OVERDUE";
    if (hoursLeft === 0) return "< 1 hour";
    if (hoursLeft < 24) return `${hoursLeft} hours`;
    const days = Math.round(hoursLeft / 24);
    return `${days} day${days !== 1 ? "s" : ""}`;
  };

  // Include descriptions, with truncation for large task lists
  const taskList = pendingTasks.map((t) => {
    let description = t.description;
    if (pendingTasks.length > 30 && description && description.length > 80) {
      description = description.slice(0, 80) + "...";
    }
    if (pendingTasks.length > 50) {
      description = null; // Omit descriptions entirely for very large lists
    }

    return {
      id: t.id,
      title: t.title,
      description,
      priority: t.priority,
      energyLevel: t.energyLevel,
      estimatedMinutes: t.estimatedMinutes,
      category: t.category,
      locationTags: t.locationTags,
      deadlineIn: relativeTime(t.deadline),
      plannedIn: relativeTime(t.scheduledFor),
      status: t.status,
    };
  });

  const locationLine = context.location
    ? `${context.location.name} (${context.location.latitude}, ${context.location.longitude})`
    : "Unknown (no location data — do NOT assume any location)";

  const currentEventLine = context.currentEvent
    ? `\n- CURRENTLY IN: "${context.currentEvent.title}" — free in ${context.currentEvent.minutesUntilFree} minutes`
    : "";

  // Format minutes as human-readable duration to prevent AI misreading large numbers
  const formatMinutes = (mins: number): string => {
    if (mins < 60) return `${mins} minutes`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (m === 0) return `${h} hour${h !== 1 ? "s" : ""}`;
    return `${h} hour${h !== 1 ? "s" : ""} ${m} min`;
  };

  let eventLine: string;
  if (!context.nextEvent) {
    eventLine = "None upcoming today (open schedule — do NOT reference any class or event)";
  } else if (context.nextEvent.minutesUntil > 180) {
    // More than 3 hours away — don't treat as a time constraint
    eventLine = `"${context.nextEvent.title}" in ${formatMinutes(context.nextEvent.minutesUntil)} (far away — treat schedule as open, do NOT use this as a time constraint)`;
  } else {
    eventLine = `"${context.nextEvent.title}" in ${formatMinutes(context.nextEvent.minutesUntil)}`;
  }

  // Pre-compute available minutes so the AI doesn't derive it from event times
  let availableTimeLine: string;
  if (context.currentEvent && context.nextEvent) {
    // Currently in an event — available time is from when current event ends to next event
    const freeAt = new Date(context.currentEvent.endTime).getTime();
    const nextAt = new Date(context.nextEvent.startTime).getTime();
    const availMins = Math.max(0, Math.round((nextAt - freeAt) / 60000));
    availableTimeLine = `\n- Available time: ${formatMinutes(availMins)} (after current event ends, before next event)`;
  } else if (context.currentEvent) {
    availableTimeLine = `\n- Available time: open schedule after current event ends in ${context.currentEvent.minutesUntilFree} minutes`;
  } else if (context.nextEvent && context.nextEvent.minutesUntil <= 180) {
    availableTimeLine = `\n- Available time: ${formatMinutes(context.nextEvent.minutesUntil)}`;
  } else {
    availableTimeLine = `\n- Available time: open schedule`;
  }

  const rejectedLine =
    recentlyRejectedTaskIds.length > 0
      ? `\n- Recently rejected task IDs (avoid these): ${recentlyRejectedTaskIds.join(", ")}`
      : "";

  // Group upcoming events by day and label them so Haiku doesn't confuse today/tomorrow
  const calendarSection = (() => {
    if (!context.upcomingEvents || context.upcomingEvents.length === 0) return "";

    const toDateStr = (d: Date) => {
      const { year, month, day } = getCalendarParts(d, context.timezone);
      return `${year}-${month}-${day}`;
    };
    const todayStr = toDateStr(now);
    const tomorrowDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowStr = toDateStr(tomorrowDate);

    const formatEvent = (e: (typeof context.upcomingEvents)[number]) => {
      const start = formatForDisplay(new Date(e.startTime), context.timezone, DISPLAY_TIME);
      const end = formatForDisplay(new Date(e.endTime), context.timezone, DISPLAY_TIME);
      const tag = e.source === "controlledchaos" ? " [Scheduled]" : "";
      return `  - ${start}–${end}: ${e.title}${tag}`;
    };

    const todayEvents = context.upcomingEvents.filter(
      (e) => toDateStr(new Date(e.startTime)) === todayStr
    );
    const tomorrowEvents = context.upcomingEvents.filter(
      (e) => toDateStr(new Date(e.startTime)) === tomorrowStr
    );

    const lines: string[] = ["\n\n## Upcoming Calendar"];
    if (todayEvents.length > 0) {
      lines.push("TODAY:");
      lines.push(...todayEvents.map(formatEvent));
    }
    if (tomorrowEvents.length > 0) {
      lines.push("TOMORROW:");
      lines.push(...tomorrowEvents.map(formatEvent));
    }
    return lines.join("\n");
  })();

  // Build a "current state" line from the most recent Moment if available
  const recentMomentLine = (() => {
    const m = context.recentMoment;
    if (!m) return "";
    const intensityStr =
      typeof m.intensity === "number" ? `, intensity ${m.intensity}/5` : "";
    const noteStr = m.note ? `, note: "${m.note}"` : "";
    return `\n- Current state: logged ${m.type} ${m.minutesAgo} min ago${intensityStr}${noteStr}`;
  })();

  const descriptionNote =
    pendingTasks.length > 50
      ? "\n\nNote: Task descriptions omitted due to volume. Prioritize based on title, priority, deadline, and energy."
      : "";

  // Extract just time-of-day to prevent Haiku from hallucinating date context
  const timeOfDay = formatForDisplay(new Date(), context.timezone, DISPLAY_TIME);

  return `## Current Context
- Time of day: ${timeOfDay}
- Location: ${locationLine}
- Current energy level: ${context.energyLevel ?? "Unknown"}${recentMomentLine}${currentEventLine}
- Next event: ${eventLine}${availableTimeLine}
- Tasks completed today: ${context.recentActivity?.tasksCompletedToday ?? 0}
- Last action: ${context.recentActivity?.lastAction ?? "None"}${rejectedLine}

NOTE: All deadline/timing info is pre-computed in the "deadlineIn" and "plannedIn" fields. Do NOT attempt to derive dates or days from any other context.${calendarSection}

## Pending Tasks (${taskList.length})
${JSON.stringify(taskList, null, 2)}${descriptionNote}

Pick the single best task.${input.aiContextBlock ? `\n\n${input.aiContextBlock}` : ""}`;
}

/**
 * Get a task recommendation from Haiku.
 */
export async function getTaskRecommendation(
  input: RecommendationInput
): Promise<TaskRecommendation> {
  if (input.pendingTasks.length === 0) {
    throw new Error("No pending tasks to recommend from");
  }

  // For a single task, skip the AI call
  if (input.pendingTasks.length === 1) {
    return {
      taskId: input.pendingTasks[0].id,
      reasoning: "This is your only pending task — let's knock it out!",
      alternatives: [],
    };
  }

  const userPrompt = buildRecommendationPrompt(input);

  const personalityBlock = buildPersonalityBlock(input.personalityPrefs ?? null);
  const systemPrompt = buildTaskRecommendationPrompt(personalityBlock);

  const result = await callHaiku({
    system: systemPrompt,
    user: userPrompt,
    maxTokens: 1024,
  });

  // Log scratchpad reasoning if present (useful for debugging recommendation quality)
  const scratchpad = extractScratchpad(result.text);
  if (scratchpad) {
    console.log(`[AI] Recommendation scratchpad:\n${scratchpad}`);
  }

  let parsed: TaskRecommendation;
  try {
    parsed = extractJSON(result.text);
  } catch {
    console.error("[AI] Failed to parse recommendation response:", result.text);
    throw new Error("AI returned invalid recommendation. Please try again.");
  }

  // Validate taskId exists in pending tasks
  const validTaskIds = new Set(input.pendingTasks.map((t) => t.id));
  if (!parsed.taskId || !validTaskIds.has(parsed.taskId)) {
    console.warn(
      `[AI] HALLUCINATED taskId: "${parsed.taskId}" — not in valid set. Falling back to priority-based selection.`
    );
    // Fall back to priority + nearest deadline, not just first task
    const priorityOrder: Record<string, number> = {
      urgent: 0,
      important: 1,
      normal: 2,
      someday: 3,
    };
    const sorted = [...input.pendingTasks].sort((a, b) => {
      const pDiff =
        (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3);
      if (pDiff !== 0) return pDiff;
      if (a.deadline && b.deadline)
        return (
          new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
        );
      if (a.deadline) return -1;
      return 1;
    });
    parsed.taskId = sorted[0].id;
    parsed.reasoning = `This is your highest priority task${sorted[0].deadline ? " with the nearest deadline" : ""}.`;
  }

  // Filter alternatives to only valid task IDs
  parsed.alternatives = (parsed.alternatives ?? [])
    .filter((alt) => validTaskIds.has(alt.taskId) && alt.taskId !== parsed.taskId)
    .slice(0, 2);

  return parsed;
}

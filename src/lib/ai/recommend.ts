import { callHaiku } from "./index";
import { buildPersonalityBlock, buildTaskRecommendationPrompt } from "./prompts";
import { extractJSON, extractScratchpad } from "./validate";
import type { UserContext, TaskRecommendation, Task, EnergyProfile, PersonalityPrefs } from "@/types";

interface RecommendationInput {
  context: UserContext;
  pendingTasks: Task[];
  recentlyRejectedTaskIds?: string[];
  personalityPrefs?: PersonalityPrefs | null;
}

/**
 * Build the user prompt that provides all context to Haiku.
 */
function buildRecommendationPrompt(input: RecommendationInput): string {
  const { context, pendingTasks, recentlyRejectedTaskIds = [] } = input;

  const now = new Date();

  // Format deadlines in the user's timezone so the AI doesn't misread UTC times
  const fmtDeadline = (iso: string | null) => {
    if (!iso) return null;
    return new Date(iso).toLocaleString("en-US", {
      timeZone: context.timezone,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  // Pre-compute hours until deadline so the AI doesn't need to do date math
  const hoursUntilDeadline = (iso: string | null): string | null => {
    if (!iso) return null;
    const deadlineMs = new Date(iso).getTime();
    const hoursLeft = Math.round((deadlineMs - now.getTime()) / 3_600_000);
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
      deadline: fmtDeadline(t.deadline),
      deadlineIn: hoursUntilDeadline(t.deadline),
      originallyPlannedFor: fmtDeadline(t.scheduledFor),
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
    eventLine = "None upcoming (open schedule — do NOT reference any class or event)";
  } else if (context.nextEvent.minutesUntil > 180) {
    // More than 3 hours away — don't treat as a time constraint
    eventLine = `"${context.nextEvent.title}" in ${formatMinutes(context.nextEvent.minutesUntil)} (far away — treat schedule as open, do NOT use this as a time constraint)`;
  } else {
    eventLine = `"${context.nextEvent.title}" in ${formatMinutes(context.nextEvent.minutesUntil)}`;
  }

  const rejectedLine =
    recentlyRejectedTaskIds.length > 0
      ? `\n- Recently rejected task IDs (avoid these): ${recentlyRejectedTaskIds.join(", ")}`
      : "";

  const calendarSection =
    context.upcomingEvents && context.upcomingEvents.length > 0
      ? `\n\n## Upcoming Calendar (today + tomorrow)\n${context.upcomingEvents
          .map((e) => {
            const start = new Date(e.startTime).toLocaleTimeString("en-US", {
              timeZone: context.timezone,
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            });
            const end = new Date(e.endTime).toLocaleTimeString("en-US", {
              timeZone: context.timezone,
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            });
            const tag = e.source === "controlledchaos" ? "[Scheduled]" : "";
            return `- ${start}–${end}: ${e.title} ${tag}`;
          })
          .join("\n")}`
      : "";

  // Format energy profile as human-readable text
  const energyProfileLine = context.energyProfile
    ? `\n- Energy profile: Morning=${context.energyProfile.morning}, Afternoon=${context.energyProfile.afternoon}, Evening=${context.energyProfile.evening}, Night=${context.energyProfile.night}`
    : "";

  const descriptionNote =
    pendingTasks.length > 50
      ? "\n\nNote: Task descriptions omitted due to volume. Prioritize based on title, priority, deadline, and energy."
      : "";

  return `## Current Context
- Time: ${context.currentTime}
- Timezone: ${context.timezone}
- Location: ${locationLine}
- Current energy level: ${context.energyLevel ?? "Unknown"}${energyProfileLine}${currentEventLine}
- Next event: ${eventLine}
- Tasks completed today: ${context.recentActivity?.tasksCompletedToday ?? 0}
- Last action: ${context.recentActivity?.lastAction ?? "None"}${rejectedLine}${calendarSection}

## Pending Tasks (${taskList.length})
${JSON.stringify(taskList, null, 2)}${descriptionNote}

Pick the single best task.`;
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

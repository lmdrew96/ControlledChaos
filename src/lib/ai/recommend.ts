import { callHaiku } from "./index";
import { TASK_RECOMMENDATION_SYSTEM_PROMPT } from "./prompts";
import type { UserContext, TaskRecommendation, Task } from "@/types";

interface RecommendationInput {
  context: UserContext;
  pendingTasks: Task[];
  recentlyRejectedTaskIds?: string[];
}

/**
 * Build the user prompt that provides all context to Haiku.
 */
function buildRecommendationPrompt(input: RecommendationInput): string {
  const { context, pendingTasks, recentlyRejectedTaskIds = [] } = input;

  const taskList = pendingTasks.map((t) => ({
    id: t.id,
    title: t.title,
    priority: t.priority,
    energyLevel: t.energyLevel,
    estimatedMinutes: t.estimatedMinutes,
    category: t.category,
    locationTags: t.locationTags,
    deadline: t.deadline,
    status: t.status,
  }));

  const locationLine = context.location
    ? `${context.location.name} (${context.location.latitude}, ${context.location.longitude})`
    : "Unknown";

  const eventLine = context.nextEvent
    ? `"${context.nextEvent.title}" in ${context.nextEvent.minutesUntil} minutes`
    : "None upcoming";

  const rejectedLine =
    recentlyRejectedTaskIds.length > 0
      ? `\n- Recently rejected task IDs (avoid these): ${recentlyRejectedTaskIds.join(", ")}`
      : "";

  return `## Current Context
- Time: ${context.currentTime}
- Timezone: ${context.timezone}
- Location: ${locationLine}
- Energy level: ${context.energyLevel ?? "Unknown"}
- Next event: ${eventLine}
- Tasks completed today: ${context.recentActivity?.tasksCompletedToday ?? 0}
- Last action: ${context.recentActivity?.lastAction ?? "None"}${rejectedLine}

## Pending Tasks (${taskList.length})
${JSON.stringify(taskList, null, 2)}

Pick the single best task. Return valid JSON: { "taskId": "...", "reasoning": "...", "alternatives": [{ "taskId": "...", "reasoning": "..." }, ...] }`;
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

  const result = await callHaiku({
    system: TASK_RECOMMENDATION_SYSTEM_PROMPT,
    user: userPrompt,
    maxTokens: 1024,
  });

  // Extract JSON (handle optional markdown code blocks)
  let jsonText = result.text.trim();
  const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonText = jsonMatch[1].trim();
  }

  let parsed: TaskRecommendation;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    console.error("[AI] Failed to parse recommendation response:", result.text);
    throw new Error("AI returned invalid recommendation. Please try again.");
  }

  // Validate taskId exists in pending tasks
  const validTaskIds = new Set(input.pendingTasks.map((t) => t.id));
  if (!parsed.taskId || !validTaskIds.has(parsed.taskId)) {
    console.warn(
      "[AI] Recommended unknown taskId, falling back to first pending task"
    );
    parsed.taskId = input.pendingTasks[0].id;
    parsed.reasoning = "This is your highest priority pending task.";
  }

  // Filter alternatives to only valid task IDs
  parsed.alternatives = (parsed.alternatives ?? [])
    .filter((alt) => validTaskIds.has(alt.taskId) && alt.taskId !== parsed.taskId)
    .slice(0, 2);

  return parsed;
}

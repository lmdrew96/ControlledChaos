import { callHaiku } from "./index";
import { BRAIN_DUMP_SYSTEM_PROMPT, VOICE_DUMP_ADDENDUM, PHOTO_DUMP_ADDENDUM } from "./prompts";
import type { BrainDumpResult, DumpInputType, ParsedTask } from "@/types";

export async function parseBrainDump(
  content: string,
  inputType: DumpInputType = "text"
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

  const result = await callHaiku({
    system,
    user: content,
    maxTokens: 4096,
  });

  // Extract JSON from the response (handle markdown code blocks)
  let jsonText = result.text.trim();
  const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonText = jsonMatch[1].trim();
  }

  let parsed: { tasks: ParsedTask[]; summary: string };
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    console.error("[AI] Failed to parse brain dump response:", result.text);
    throw new Error("AI returned invalid response. Please try again.");
  }

  if (!parsed.tasks || !Array.isArray(parsed.tasks)) {
    throw new Error("AI returned unexpected format. Please try again.");
  }

  // Validate and sanitize each task
  const tasks: ParsedTask[] = parsed.tasks.map((task) => ({
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
    locationTag: task.locationTag
      ? validateEnum(
          task.locationTag,
          ["home", "campus", "work", "anywhere"],
          undefined
        )
      : undefined,
    deadline: task.deadline || undefined,
    goalConnection: task.goalConnection || undefined,
  }));

  return {
    tasks,
    summary: parsed.summary || `Parsed ${tasks.length} tasks from brain dump`,
  };
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

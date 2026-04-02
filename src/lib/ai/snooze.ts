import Anthropic from "@anthropic-ai/sdk";
import type { Task } from "@/types";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface SnoozeContext {
  currentTimeIso: string; // ISO string in user's timezone
  timezone: string;
}

export interface SnoozeDecision {
  snoozeMinutes: number;
  reason: string; // Short, user-facing text for the toast
}

/**
 * Ask Haiku how long to snooze a task based on its priority, deadline, and
 * the user's current time context. Returns snoozeMinutes + a short reason string
 * to show in the toast.
 */
export async function getSnoozeDecision(
  task: Task,
  context: SnoozeContext
): Promise<SnoozeDecision> {
  const deadlineStr = task.deadline
    ? new Date(task.deadline).toLocaleString("en-US", {
        timeZone: context.timezone,
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
    : null;

  const hoursUntilDeadline = task.deadline
    ? (new Date(task.deadline).getTime() - Date.now()) / 3_600_000
    : null;

  const prompt = `You are deciding how long to snooze a task for a user who just said "Not now."

Current time: ${context.currentTimeIso}
Timezone: ${context.timezone}

Task:
- Title: ${task.title}
- Priority: ${task.priority} (urgent > important > normal > someday)
- Estimated time: ${task.estimatedMinutes ? `${task.estimatedMinutes} min` : "unknown"}
- Deadline: ${deadlineStr ?? "none"}${hoursUntilDeadline !== null ? ` (${hoursUntilDeadline.toFixed(1)}h from now)` : ""}
- Status: ${task.status}

Snooze duration guidelines:
- Urgent priority OR deadline < 2 hours away → 15–20 minutes
- Deadline within today (< 8 hours) → 30–45 minutes
- Deadline tomorrow → 60–90 minutes
- No deadline, normal/important priority → 90–120 minutes
- Someday / no deadline, low stakes → 180–240 minutes

Respond with ONLY valid JSON, no markdown, no explanation:
{"snoozeMinutes": <integer>, "reason": "<one short sentence, max 10 words, explaining why, no period>"}

Examples of good reason strings:
- "Deadline's in 2 hours — checking back in 15"
- "No rush on this one, see you in 2 hours"
- "Due tonight — snoozing 45 minutes"`;

  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 80,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = (message.content[0] as { type: string; text: string }).text.trim();
    const parsed = JSON.parse(raw) as { snoozeMinutes: unknown; reason: unknown };

    const snoozeMinutes = Number(parsed.snoozeMinutes);
    const reason = String(parsed.reason ?? "");

    if (!Number.isFinite(snoozeMinutes) || snoozeMinutes <= 0) {
      throw new Error("Invalid snoozeMinutes");
    }

    return { snoozeMinutes: Math.round(snoozeMinutes), reason };
  } catch (err) {
    console.error("[Snooze] Haiku snooze decision failed, using fallback:", err);
    // Fallback based on priority
    const fallback: Record<string, number> = {
      urgent: 20,
      important: 45,
      normal: 90,
      someday: 180,
    };
    const snoozeMinutes = fallback[task.priority] ?? 60;
    return { snoozeMinutes, reason: `Back in ${snoozeMinutes < 60 ? `${snoozeMinutes} min` : `${snoozeMinutes / 60}h`}` };
  }
}

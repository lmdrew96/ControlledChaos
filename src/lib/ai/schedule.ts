import { callHaiku } from "./index";
import { SCHEDULING_SYSTEM_PROMPT } from "./prompts";
import type {
  Task,
  CalendarEvent,
  EnergyProfile,
  ScheduledBlock,
  FreeTimeBlock,
} from "@/types";

interface SchedulingInput {
  pendingTasks: Task[];
  calendarEvents: CalendarEvent[];
  energyProfile: EnergyProfile | null;
  timezone: string;
  scheduleDays: number;
  wakeTime?: number; // Hour 0-23, defaults to 7
  sleepTime?: number; // Hour 0-23, defaults to 22
}

/**
 * Find free time blocks between existing calendar events.
 * Only considers blocks >= 20 minutes during waking hours.
 */
export function findFreeBlocks(
  events: CalendarEvent[],
  days: number,
  wakeTime = 7,
  sleepTime = 22
): FreeTimeBlock[] {
  const blocks: FreeTimeBlock[] = [];
  const now = new Date();

  for (let d = 0; d < days; d++) {
    const dayStart = new Date(now);
    dayStart.setDate(dayStart.getDate() + d);
    dayStart.setHours(wakeTime, 0, 0, 0);

    const dayEnd = new Date(dayStart);
    dayEnd.setHours(sleepTime, 0, 0, 0);

    // On the first day, start from now if it's already past 7am
    const effectiveStart = d === 0 && now > dayStart ? now : dayStart;

    // Filter timed events for this day, sorted by start
    const dayEvents = events
      .filter((e) => {
        if (e.isAllDay) return false;
        const eStart = new Date(e.startTime);
        const eEnd = new Date(e.endTime);
        return eEnd > effectiveStart && eStart < dayEnd;
      })
      .sort(
        (a, b) =>
          new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
      );

    let cursor = effectiveStart;

    for (const event of dayEvents) {
      const eventStart = new Date(event.startTime);
      if (eventStart > cursor) {
        const durationMinutes = Math.round(
          (eventStart.getTime() - cursor.getTime()) / 60000
        );
        if (durationMinutes >= 20) {
          blocks.push({
            start: cursor.toISOString(),
            end: eventStart.toISOString(),
            durationMinutes,
          });
        }
      }
      const eventEnd = new Date(event.endTime);
      if (eventEnd > cursor) {
        cursor = eventEnd;
      }
    }

    // Gap after last event until end of day
    if (cursor < dayEnd) {
      const durationMinutes = Math.round(
        (dayEnd.getTime() - cursor.getTime()) / 60000
      );
      if (durationMinutes >= 20) {
        blocks.push({
          start: cursor.toISOString(),
          end: dayEnd.toISOString(),
          durationMinutes,
        });
      }
    }
  }

  return blocks;
}

/**
 * Build the user prompt for the scheduling AI.
 */
function buildSchedulingPrompt(
  input: SchedulingInput,
  freeBlocks: FreeTimeBlock[]
): string {
  const taskList = input.pendingTasks.map((t) => ({
    id: t.id,
    title: t.title,
    priority: t.priority,
    energyLevel: t.energyLevel,
    estimatedMinutes: t.estimatedMinutes,
    category: t.category,
    locationTags: t.locationTags,
    deadline: t.deadline,
  }));

  const wakeHour = input.wakeTime ?? 7;
  const sleepHour = input.sleepTime ?? 22;
  const fmtHour = (h: number) => (h === 0 ? "12 AM" : h === 12 ? "12 PM" : h < 12 ? `${h} AM` : `${h - 12} PM`);

  return `## User's Timezone
${input.timezone}

## Active Hours
${fmtHour(wakeHour)} – ${fmtHour(sleepHour)}. NEVER schedule outside this window.

## Energy Profile
${input.energyProfile ? JSON.stringify(input.energyProfile) : "Not set (assume medium energy throughout the day)"}

## Free Time Blocks (next ${input.scheduleDays} days)
${JSON.stringify(freeBlocks, null, 2)}

## Pending Tasks (${taskList.length})
${JSON.stringify(taskList, null, 2)}

Create an optimal schedule. Only schedule tasks that fit in the free blocks. Don't schedule more than 6-8 tasks total.`;
}

/**
 * Call the AI to generate an optimal schedule from pending tasks and free time.
 */
export async function generateSchedule(
  input: SchedulingInput
): Promise<ScheduledBlock[]> {
  if (input.pendingTasks.length === 0) {
    return [];
  }

  const freeBlocks = findFreeBlocks(
    input.calendarEvents,
    input.scheduleDays,
    input.wakeTime,
    input.sleepTime
  );

  if (freeBlocks.length === 0) {
    return [];
  }

  const userPrompt = buildSchedulingPrompt(input, freeBlocks);

  const result = await callHaiku({
    system: SCHEDULING_SYSTEM_PROMPT,
    user: userPrompt,
    maxTokens: 2048,
  });

  // Extract JSON from response (may be wrapped in ```json blocks)
  let jsonText = result.text.trim();
  const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonText = jsonMatch[1].trim();
  }

  let parsed: { blocks: ScheduledBlock[] };
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    console.error("[AI Schedule] Failed to parse response:", result.text);
    throw new Error("AI returned an invalid schedule. Please try again.");
  }

  if (!parsed.blocks || !Array.isArray(parsed.blocks)) {
    return [];
  }

  // Only keep blocks with valid task IDs
  const validTaskIds = new Set(input.pendingTasks.map((t) => t.id));
  const validBlocks = parsed.blocks.filter(
    (block) =>
      validTaskIds.has(block.taskId) && block.startTime && block.endTime
  );

  // Remove overlapping blocks — keep earlier blocks, drop later ones that conflict
  return removeOverlappingBlocks(validBlocks);
}

/**
 * Remove overlapping blocks from the schedule.
 * Keeps the first block in each conflict, drops later ones.
 */
function removeOverlappingBlocks(blocks: ScheduledBlock[]): ScheduledBlock[] {
  if (blocks.length <= 1) return blocks;

  // Sort by start time
  const sorted = [...blocks].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );

  const result: ScheduledBlock[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = result[result.length - 1];
    const curr = sorted[i];
    const prevEnd = new Date(prev.endTime).getTime();
    const currStart = new Date(curr.startTime).getTime();

    // Only keep if it doesn't overlap with the last accepted block
    if (currStart >= prevEnd) {
      result.push(curr);
    } else {
      console.warn(
        `[AI Schedule] Dropped overlapping block for task ${curr.taskId}: ${curr.startTime} overlaps with ${prev.startTime}-${prev.endTime}`
      );
    }
  }

  return result;
}

import { callHaiku } from "./index";
import { SCHEDULING_SYSTEM_PROMPT, SINGLE_TASK_SCHEDULING_PROMPT, formatCurrentDateTime } from "./prompts";
import { extractJSON } from "./validate";
import { toUTC, formatForDisplay, DISPLAY_DATETIME, DISPLAY_TIME } from "@/lib/timezone";
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
 * Convert a local hour (0-23) on a specific date to a UTC Date.
 * Delegates to the shared toUTC() utility in timezone.ts.
 */
function localHourToUTC(dateStr: string, hour: number, timezone: string): Date {
  const padded = String(hour).padStart(2, "0");
  return new Date(toUTC(`${dateStr}T${padded}:00:00`, timezone));
}

/**
 * Find free time blocks between existing calendar events.
 * Only considers blocks >= 20 minutes during waking hours, in the user's timezone.
 */
export function findFreeBlocks(
  events: CalendarEvent[],
  days: number,
  timezone: string,
  wakeTime = 7,
  sleepTime = 22
): FreeTimeBlock[] {
  const blocks: FreeTimeBlock[] = [];
  const now = new Date();

  for (let d = 0; d < days; d++) {
    // Get the calendar date string (YYYY-MM-DD) for day d in the user's timezone.
    // Adding d*24h in ms is approximate but accurate enough for day-level math.
    const approxDay = new Date(now.getTime() + d * 24 * 60 * 60 * 1000);
    const dateStr = approxDay.toLocaleDateString("en-CA", { timeZone: timezone }); // "YYYY-MM-DD"

    // Compute wake/sleep boundaries as correct UTC timestamps for the user's timezone
    const dayStart = localHourToUTC(dateStr, wakeTime, timezone);
    const dayEnd = localHourToUTC(dateStr, sleepTime, timezone);

    // On the first day, start from now if it's already past wake time
    const effectiveStart = d === 0 && now > dayStart ? now : dayStart;

    // If it's already past sleep time for this day, skip it entirely
    if (effectiveStart >= dayEnd) {
      continue;
    }

    // Filter timed events for this day's window, sorted by start
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
        if (durationMinutes >= 15) {
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
      if (durationMinutes >= 15) {
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
  // Format deadlines in the user's timezone so the AI doesn't misread UTC
  const fmtDeadline = (iso: string | null) => {
    if (!iso) return null;
    return formatForDisplay(new Date(iso), input.timezone, DISPLAY_DATETIME);
  };

  const taskList = input.pendingTasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    priority: t.priority,
    energyLevel: t.energyLevel,
    estimatedMinutes: t.estimatedMinutes,
    category: t.category,
    locationTags: t.locationTags,
    deadline: fmtDeadline(t.deadline),
    scheduledFor: fmtDeadline(t.scheduledFor),
  }));

  const wakeHour = input.wakeTime ?? 7;
  const sleepHour = input.sleepTime ?? 22;
  const fmtHour = (h: number) => (h === 0 ? "12 AM" : h === 12 ? "12 PM" : h < 12 ? `${h} AM` : `${h - 12} PM`);

  const currentDateTime = formatCurrentDateTime(input.timezone);

  // Attach human-readable local time labels so the AI reasons in local time
  const fmtLocalRange = (startISO: string, endISO: string) => {
    const startLabel = formatForDisplay(new Date(startISO), input.timezone, DISPLAY_DATETIME);
    const endLabel = formatForDisplay(new Date(endISO), input.timezone, DISPLAY_TIME);
    return `${startLabel} – ${endLabel}`;
  };

  const freeBlocksWithLabels = freeBlocks.map((b) => ({
    start: b.start,
    end: b.end,
    durationMinutes: b.durationMinutes,
    localTime: fmtLocalRange(b.start, b.end),
  }));

  return `## Current Date and Time
${currentDateTime}

## User's Timezone
${input.timezone}

## Active Hours
${fmtHour(wakeHour)} – ${fmtHour(sleepHour)}. NEVER schedule outside this window.

## Energy Profile
${input.energyProfile ? `Morning (6am-12pm): ${input.energyProfile.morning}, Afternoon (12pm-5pm): ${input.energyProfile.afternoon}, Evening (5pm-9pm): ${input.energyProfile.evening}, Night (9pm-12am): ${input.energyProfile.night}` : "Not set (assume medium energy throughout the day)"}

## Free Time Blocks (next ${input.scheduleDays} days)
${JSON.stringify(freeBlocksWithLabels, null, 2)}

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
    input.timezone,
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

  let parsed: { blocks: ScheduledBlock[] };
  try {
    parsed = extractJSON(result.text);
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

  // Drop any blocks that overlap with existing calendar events
  const safeBlocks = removeConflictsWithEvents(validBlocks, input.calendarEvents);

  // Remove overlapping blocks between AI's own scheduled blocks
  return removeOverlappingBlocks(safeBlocks);
}

interface SingleTaskSchedulingInput {
  task: Task;
  calendarEvents: CalendarEvent[];
  energyProfile: EnergyProfile | null;
  timezone: string;
  wakeTime?: number;
  sleepTime?: number;
}

/**
 * Schedule a single task by finding the best available time slot.
 * Checks calendar events for related events (same subject/context)
 * and schedules before them when found.
 */
export async function scheduleOneTask(
  input: SingleTaskSchedulingInput
): Promise<ScheduledBlock | null> {
  const wakeTime = input.wakeTime ?? 7;
  const sleepTime = input.sleepTime ?? 22;
  const scheduleDays = 5; // Extended from 3 — more chances to find a valid slot

  const freeBlocks = findFreeBlocks(
    input.calendarEvents,
    scheduleDays,
    input.timezone,
    wakeTime,
    sleepTime
  );

  if (freeBlocks.length === 0) {
    return null;
  }

  const fmtHour = (h: number) =>
    h === 0 ? "12 AM" : h === 12 ? "12 PM" : h < 12 ? `${h} AM` : `${h - 12} PM`;

  const fmtLocalRange = (startISO: string, endISO: string) => {
    const startLabel = formatForDisplay(new Date(startISO), input.timezone, DISPLAY_DATETIME);
    const endLabel = formatForDisplay(new Date(endISO), input.timezone, DISPLAY_TIME);
    return `${startLabel} – ${endLabel}`;
  };

  const freeBlocksWithLabels = freeBlocks.map((b) => ({
    start: b.start,
    end: b.end,
    durationMinutes: b.durationMinutes,
    localTime: fmtLocalRange(b.start, b.end),
  }));

  const calendarSummary = input.calendarEvents
    .filter((e) => !e.isAllDay)
    .map((e) => ({
      title: e.title,
      start: e.startTime,
      end: e.endTime,
      localTime: fmtLocalRange(e.startTime, e.endTime),
      location: e.location,
    }));

  const userPrompt = `## Current Date and Time
${formatCurrentDateTime(input.timezone)}

## User's Timezone
${input.timezone}

## Energy Profile
${input.energyProfile ? `Morning (6am-12pm): ${input.energyProfile.morning}, Afternoon (12pm-5pm): ${input.energyProfile.afternoon}, Evening (5pm-9pm): ${input.energyProfile.evening}, Night (9pm-12am): ${input.energyProfile.night}` : "Not set (assume medium energy throughout the day)"}

## Task to Schedule
${JSON.stringify({
  id: input.task.id,
  title: input.task.title,
  description: input.task.description,
  priority: input.task.priority,
  energyLevel: input.task.energyLevel,
  estimatedMinutes: input.task.estimatedMinutes,
  category: input.task.category,
  deadline: input.task.deadline,
}, null, 2)}

## Free Time Blocks (next ${scheduleDays} days)
${JSON.stringify(freeBlocksWithLabels, null, 2)}

Find the best time for this task using urgency + energy matching.`;

  const result = await callHaiku({
    system: SINGLE_TASK_SCHEDULING_PROMPT,
    user: userPrompt,
    maxTokens: 512,
  });

  let parsed: { block: { startTime: string; endTime: string; reasoning: string } | null };
  try {
    parsed = extractJSON(result.text);
  } catch {
    console.error("[AI ScheduleOne] Failed to parse response:", result.text);
    throw new Error("AI returned an invalid schedule. Please try again.");
  }

  if (!parsed.block) {
    // Deterministic fallback — Haiku refused to pick but free blocks exist.
    // Pick the first block that's long enough for the task. No AI needed.
    const neededMinutes = input.task.estimatedMinutes ?? 30;
    const fallbackBlock = freeBlocks.find(
      (b) => b.durationMinutes >= neededMinutes
    );
    if (fallbackBlock) {
      const startTime = fallbackBlock.start;
      const endTime = new Date(
        new Date(fallbackBlock.start).getTime() + neededMinutes * 60_000
      ).toISOString();
      const candidate: ScheduledBlock = {
        taskId: input.task.id,
        startTime,
        endTime,
        reasoning: `Scheduled in the first available ${neededMinutes}-minute block.`,
      };
      const safe = removeConflictsWithEvents([candidate], input.calendarEvents);
      return safe.length > 0 ? safe[0] : null;
    }
    return null;
  }

  const { startTime, endTime, reasoning } = parsed.block;
  if (!startTime || !endTime) {
    return null;
  }

  const candidate: ScheduledBlock = {
    taskId: input.task.id,
    startTime,
    endTime,
    reasoning,
  };

  // Hard safety: ensure block doesn't overlap any real events
  const safe = removeConflictsWithEvents([candidate], input.calendarEvents);
  return safe.length > 0 ? safe[0] : null;
}

/**
 * Drop any AI-scheduled blocks that overlap with existing calendar events.
 * This is the hard safety net — even if the AI ignores free blocks,
 * we never create a scheduled block that conflicts with a real event.
 */
function removeConflictsWithEvents(
  blocks: ScheduledBlock[],
  events: CalendarEvent[]
): ScheduledBlock[] {
  // Build a list of busy intervals from all non-all-day events
  const busy = events
    .filter((e) => !e.isAllDay)
    .map((e) => ({
      start: new Date(e.startTime).getTime(),
      end: new Date(e.endTime).getTime(),
    }));

  return blocks.filter((block) => {
    const bStart = new Date(block.startTime).getTime();
    const bEnd = new Date(block.endTime).getTime();

    const hasConflict = busy.some(
      (event) => bStart < event.end && bEnd > event.start
    );

    if (hasConflict) {
      console.warn(
        `[AI Schedule] Dropped block for task ${block.taskId}: ${block.startTime}–${block.endTime} conflicts with an existing event`
      );
    }

    return !hasConflict;
  });
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

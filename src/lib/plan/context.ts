import {
  getUser,
  getUserSettings,
  getPendingTasks,
  getCalendarEventsByDateRange,
  getScheduledTasksInRange,
} from "@/lib/db/queries";
import { buildAIContext } from "@/lib/ai/context";
import { syncCanvasCalendar } from "@/lib/calendar/sync-canvas";
import { getCurrentEnergy } from "@/lib/context/energy";
import { planBlocksAsBusyIntervals, todayPlanningWindow } from "@/lib/calendar/plan-blocks";
import type { CalendarEvent, PersonalityPrefs, Task } from "@/types";

type TaskRow = Awaited<ReturnType<typeof getPendingTasks>>[number];

/** DB row (Dates) → the Task shape the AI layer expects (ISO strings). */
export function serializeTask(t: TaskRow): Task {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    energyLevel: t.energyLevel,
    estimatedMinutes: t.estimatedMinutes,
    category: t.category,
    locationTags: t.locationTags,
    deadline: t.deadline?.toISOString() ?? null,
    targetDate: t.targetDate?.toISOString() ?? null,
    scheduledFor: t.scheduledFor?.toISOString() ?? null,
    completedAt: t.completedAt?.toISOString() ?? null,
    sourceDumpId: t.sourceDumpId ?? null,
    sourceEventId: t.sourceEventId ?? null,
    goalId: t.goalId ?? null,
    progressSteps: (t.progressSteps as Task["progressSteps"]) ?? null,
    currentStepIndex: t.currentStepIndex ?? 0,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

function serializeEvent(
  e: Awaited<ReturnType<typeof getCalendarEventsByDateRange>>[number]
): CalendarEvent {
  return {
    id: e.id,
    userId: e.userId,
    source: e.source as CalendarEvent["source"],
    externalId: e.externalId,
    title: e.title,
    description: e.description,
    startTime: e.startTime.toISOString(),
    endTime: e.endTime.toISOString(),
    location: e.location,
    category: (e.category as CalendarEvent["category"]) ?? null,
    isAllDay: e.isAllDay ?? false,
    seriesId: e.seriesId ?? null,
    sourceDumpId: e.sourceDumpId ?? null,
    syncedAt: e.syncedAt.toISOString(),
  };
}

export interface PlanningContext {
  timezone: string;
  wakeHour: number;
  sleepHour: number;
  /** null when the sleep hour has already passed — nothing left to plan today. */
  window: { start: Date; end: Date } | null;
  /** Real events PLUS committed plan blocks, so the scheduler sees both as busy. */
  busyIntervals: CalendarEvent[];
  /** Pending tasks that are NOT already planned into the window. */
  schedulableTasks: Task[];
  currentEnergy: "low" | "medium" | "high" | null;
  personalityPrefs: PersonalityPrefs | null;
  aiContextBlock: string;
}

/**
 * Everything both proposing a whole day and retrying a single block need.
 *
 * The important detail is that already-committed plan blocks are folded into
 * `busyIntervals`. A plan block is not a calendar event, but it is still time
 * the user has claimed — without this, a second run would double-book on top
 * of the first.
 */
export async function buildPlanningContext(
  userId: string
): Promise<PlanningContext> {
  const [user, settings, pendingTasks, aiCtx] = await Promise.all([
    getUser(userId),
    getUserSettings(userId),
    getPendingTasks(userId),
    buildAIContext(userId, { skipCalendar: true }),
  ]);

  const timezone = user?.timezone ?? "America/New_York";
  const wakeHour = (settings?.wakeTime as number) ?? 7;
  const sleepHour = (settings?.sleepTime as number) ?? 22;

  // Canvas first, so we plan around today's real commitments.
  if (settings?.canvasIcalUrl) {
    await syncCanvasCalendar(
      userId,
      settings.canvasIcalUrl,
      timezone,
      settings.autoAddCanvasTasks ?? true
    ).catch((err) => console.error("[Plan] Canvas pre-sync failed:", err));
  }

  const window = todayPlanningWindow(timezone, wakeHour, sleepHour);

  let busyIntervals: CalendarEvent[] = [];
  let alreadyPlannedIds = new Set<string>();

  if (window) {
    const [events, scheduled] = await Promise.all([
      getCalendarEventsByDateRange(userId, window.start, window.end),
      getScheduledTasksInRange(userId, window.start, window.end),
    ]);

    alreadyPlannedIds = new Set(scheduled.map((t) => t.id));
    busyIntervals = [
      ...events.map(serializeEvent),
      ...planBlocksAsBusyIntervals(
        scheduled.map((t) => ({
          id: t.id,
          title: t.title,
          scheduledFor: t.scheduledFor?.toISOString() ?? null,
          estimatedMinutes: t.estimatedMinutes,
        }))
      ),
    ];
  }

  const currentEnergy = await getCurrentEnergy(userId, timezone);

  return {
    timezone,
    wakeHour,
    sleepHour,
    window,
    busyIntervals,
    schedulableTasks: pendingTasks
      .filter((t) => !alreadyPlannedIds.has(t.id))
      .map(serializeTask),
    currentEnergy,
    personalityPrefs: (settings?.personalityPrefs as PersonalityPrefs | null) ?? null,
    aiContextBlock: aiCtx.formatted,
  };
}

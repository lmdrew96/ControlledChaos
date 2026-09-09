// ============================================================
// User AI Context Snapshot
// Builds a concise summary of the user's current state
// (tasks, calendar, energy, activity) for injection into any
// AI call that needs situational awareness.
// ============================================================

import {
  getUser,
  getPendingTasks,
  getTasksCompletedToday,
  getCalendarEventsByDateRange,
  getRecentTaskActivity,
  getActiveCrisisPlans,
  getScheduledSessionsInRange,
} from "@/lib/db/queries";
import { getCurrentEnergy, getTimeOfDayBlock } from "@/lib/context/energy";
import { formatCurrentDateTime } from "@/lib/ai/prompts";
import {
  startOfDayInTimezone,
  allDayRange,
  toDateKeyInTimezone,
  formatForDisplay,
  DISPLAY_TIME,
  DISPLAY_DATE,
} from "@/lib/timezone";

export interface UserSnapshot {
  timezone: string;
  currentTime: string;
  /** Most recent energy signal from Moments, or null if none logged recently. */
  energyLevel: string | null;
  pendingTaskCount: number;
  completedTodayCount: number;
  topPendingTasks: Array<{
    title: string;
    priority: string;
    /** pending | in_progress | snoozed — getPendingTasks returns all three. */
    status: string;
    estimatedMinutes: number | null;
    /** Where the task can be done; null/empty means anywhere. */
    locationTags: string[] | null;
    /** The user's own note on the task, trimmed for prompt budget. */
    note: string | null;
    deadline: string | null;
    targetDate: string | null;
    scheduledFor: string | null;
  }>;
  todayEvents: Array<{
    title: string;
    startTime: string;
    endTime: string;
    isAllDay: boolean;
    location: string | null;
  }>;
  activeCrisisCount: number;
  activitySignal: string | null;
  /** Pre-formatted text block ready to append to any AI user message */
  formatted: string;
}

/**
 * The user's own note on a task, trimmed to fit a prompt budget.
 *
 * This snapshot rides along on every AI call, so the full description would be
 * unbounded. But dropping it entirely — which is what used to happen — means
 * every generated message can only ever talk about a task's title, even when
 * the note is where the actual substance is.
 */
function summarizeNote(description: string | null): string | null {
  const text = description?.trim();
  if (!text) return null;
  const oneLine = text.replace(/\s+/g, " ");
  return oneLine.length <= 120 ? oneLine : `${oneLine.slice(0, 117)}...`;
}

/**
 * Build a snapshot of the user's current state for AI context.
 * This is the single source of truth for "what does the user's day look like?"
 * Use this anywhere the AI needs situational awareness — notifications,
 * recommendations, nudges, digests.
 *
 * The `formatted` field is a ready-to-use text block for AI prompts.
 */
export async function buildUserSnapshot(userId: string): Promise<UserSnapshot> {
  const user = await getUser(userId);

  const timezone = user?.timezone ?? "America/New_York";
  const currentTime = formatCurrentDateTime(timezone);

  const now = new Date();
  // Next LOCAL midnight, as an exclusive upper bound. Adding 86_400_000ms to
  // the start of day is an hour off on both DST days, which let tomorrow's
  // early events leak into "today" every spring.
  const endOfDay = new Date(
    allDayRange(toDateKeyInTimezone(now, timezone), timezone).endISO
  );

  const [pendingTasks, completedToday, todayEvents, recentActivity, crisisPlans, energyLevel] =
    await Promise.all([
      getPendingTasks(userId),
      getTasksCompletedToday(userId, timezone),
      getCalendarEventsByDateRange(userId, now, endOfDay),
      getRecentTaskActivity(userId, 10),
      getActiveCrisisPlans(userId),
      getCurrentEnergy(userId, timezone),
    ]);

  const timeBlock = getTimeOfDayBlock(timezone);

  // Top 5 pending tasks (already sorted by deadline priority from query).
  // All three times ride along: a snapshot that only carried `deadline` had
  // every AI surface describing a self-imposed target as "due", which is the
  // one thing HARD_SOFT_TIME_RULES says never to do.
  const topPending = pendingTasks.slice(0, 5).map((t) => ({
    title: t.title,
    priority: t.priority,
    // getPendingTasks returns pending, in_progress AND woken-from-snooze rows.
    // Flattening them lost the difference, so every AI surface told the user to
    // "start" work they had already started.
    status: t.status,
    estimatedMinutes: t.estimatedMinutes ?? null,
    locationTags: t.locationTags ?? null,
    note: summarizeNote(t.description),
    deadline: t.deadline?.toISOString() ?? null,
    targetDate: t.targetDate?.toISOString() ?? null,
    scheduledFor: t.scheduledFor?.toISOString() ?? null,
  }));

  // Work the user planned to START today. Not a due date of any kind — but it
  // is time they have claimed, and copy that ignores it reads as oblivious.
  //
  // Read from SESSIONS: a task planned for two sittings today is two entries,
  // because "3pm and again at 8pm" is what the user actually committed to.
  // Filtering pendingTasks by scheduledFor only ever surfaced the earliest.
  const plannedToday = await getScheduledSessionsInRange(
    userId,
    startOfDayInTimezone(now, timezone),
    endOfDay
  );

  // Format events for AI consumption
  const formattedEvents = todayEvents.map((e) => ({
    title: e.title,
    startTime: formatForDisplay(e.startTime, timezone, DISPLAY_TIME),
    endTime: formatForDisplay(e.endTime, timezone, DISPLAY_TIME),
    isAllDay: e.isAllDay ?? false,
    location: e.location ?? null,
  }));

  // Build the formatted text block
  const lines: string[] = [];
  lines.push(`--- User's Current Context ---`);
  lines.push(`Time: ${currentTime}`);
  lines.push(
    `Energy: ${energyLevel ?? "not logged recently"} (${timeBlock})`
  );
  lines.push(`Tasks completed today: ${completedToday.length}`);
  lines.push(`Pending tasks: ${pendingTasks.length}`);

  if (topPending.length > 0) {
    lines.push(`Top pending:`);
    for (const t of topPending) {
      const times: string[] = [];
      if (t.deadline) {
        times.push(
          `HARD deadline ${formatForDisplay(new Date(t.deadline), timezone, DISPLAY_DATE)}`
        );
      }
      if (t.targetDate) {
        times.push(
          `SOFT self-imposed target ${formatForDisplay(new Date(t.targetDate), timezone, DISPLAY_DATE)} — NOT due, do not call it due`
        );
      }
      if (t.scheduledFor) {
        times.push(
          `planned to start ${formatForDisplay(new Date(t.scheduledFor), timezone, DISPLAY_TIME)}`
        );
      }
      if (t.estimatedMinutes) times.push(`~${t.estimatedMinutes} min of work`);
      if (t.locationTags?.length) {
        times.push(`only doable at: ${t.locationTags.join(" or ")}`);
      }
      const state = t.status === "in_progress" ? " ALREADY IN PROGRESS" : "";
      const suffix = times.length > 0 ? ` (${times.join("; ")})` : "";
      const note = t.note ? `\n      note: ${t.note}` : "";
      lines.push(`  - ${t.title} [${t.priority}]${state}${suffix}${note}`);
    }
  }

  if (plannedToday.length > 0) {
    lines.push(`Planned to work on today (their own plan, not deadlines):`);
    // Count sittings per task so the model can say "the second of two blocks"
    // rather than repeating a title as though it were two separate jobs.
    const sittings = new Map<string, number>();
    for (const t of plannedToday) {
      sittings.set(t.id, (sittings.get(t.id) ?? 0) + 1);
    }
    const seen = new Map<string, number>();
    for (const t of plannedToday) {
      const total = sittings.get(t.id) ?? 1;
      const nth = (seen.get(t.id) ?? 0) + 1;
      seen.set(t.id, nth);
      const which = total > 1 ? ` (sitting ${nth} of ${total})` : "";
      lines.push(
        `  - ${formatForDisplay(new Date(t.scheduledFor), timezone, DISPLAY_TIME)}: ${t.title}${which}`
      );
    }
  }

  if (formattedEvents.length > 0) {
    lines.push(`Remaining schedule today:`);
    for (const e of formattedEvents) {
      // An all-day event has no meaningful clock time. It used to render as
      // "12:00 AM–11:59 PM", which reads to the model as a real 24-hour
      // commitment blocking the entire day.
      const when = e.isAllDay ? "all day" : `${e.startTime}–${e.endTime}`;
      const where = e.location ? ` @ ${e.location}` : "";
      lines.push(`  - ${e.title}: ${when}${where}`);
    }
  } else {
    lines.push(`No more events scheduled today.`);
  }

  // Recent activity signal
  let activitySignal: string | null = null;
  if (recentActivity.length > 0) {
    const lastAction = recentActivity[0];
    const lastActionTime = formatForDisplay(
      new Date(lastAction.createdAt), timezone, DISPLAY_TIME
    );
    lines.push(`Last activity: ${lastAction.action} at ${lastActionTime}`);

    // Quick behavior signal from recent actions
    const snoozeRejectCount = recentActivity.filter(
      (a) => a.action === "snoozed" || a.action === "rejected"
    ).length;
    const completeCount = recentActivity.filter(
      (a) => a.action === "completed"
    ).length;

    if (snoozeRejectCount > completeCount && snoozeRejectCount >= 3) {
      activitySignal = "User has been snoozing/rejecting more than completing — possible low-energy or avoidance phase.";
    } else if (completeCount >= 4) {
      activitySignal = "User is on a productivity streak.";
    }
  }

  // Active crises
  const activeCrisisCount = crisisPlans.length;
  if (crisisPlans.length > 0) {
    lines.push(`Active crises: ${crisisPlans.length}`);
    for (const c of crisisPlans) {
      const totalTasks = (c.tasks as unknown[]).length;
      const pct = totalTasks > 0 ? Math.round((c.currentTaskIndex / totalTasks) * 100) : 0;
      lines.push(`  - "${c.taskName}" (${c.panicLevel}, ${pct}% done)`);
    }
  }

  // Activity signal
  if (activitySignal) {
    lines.push(`Behavior: ${activitySignal}`);
  }

  return {
    timezone,
    currentTime,
    energyLevel,
    pendingTaskCount: pendingTasks.length,
    completedTodayCount: completedToday.length,
    topPendingTasks: topPending,
    todayEvents: formattedEvents,
    activeCrisisCount,
    activitySignal,
    formatted: lines.join("\n"),
  };
}

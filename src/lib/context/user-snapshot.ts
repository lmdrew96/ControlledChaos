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
} from "@/lib/db/queries";
import { getCurrentEnergy, getTimeOfDayBlock } from "@/lib/context/energy";
import { formatCurrentDateTime } from "@/lib/ai/prompts";
import { startOfDayInTimezone } from "@/lib/timezone";
import { formatForDisplay, DISPLAY_TIME, DISPLAY_DATE } from "@/lib/timezone";

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
    deadline: string | null;
  }>;
  todayEvents: Array<{
    title: string;
    startTime: string;
    endTime: string;
  }>;
  activeCrisisCount: number;
  activitySignal: string | null;
  /** Pre-formatted text block ready to append to any AI user message */
  formatted: string;
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
  const endOfDay = new Date(startOfDayInTimezone(now, timezone).getTime() + 86_400_000 - 1);

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

  // Top 5 pending tasks (already sorted by deadline priority from query)
  const topPending = pendingTasks.slice(0, 5).map((t) => ({
    title: t.title,
    priority: t.priority,
    deadline: t.deadline?.toISOString() ?? null,
  }));

  // Format events for AI consumption
  const formattedEvents = todayEvents.map((e) => ({
    title: e.title,
    startTime: formatForDisplay(e.startTime, timezone, DISPLAY_TIME),
    endTime: formatForDisplay(e.endTime, timezone, DISPLAY_TIME),
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
      const deadlineStr = t.deadline
        ? ` (due ${formatForDisplay(new Date(t.deadline), timezone, DISPLAY_DATE)})`
        : "";
      lines.push(`  - ${t.title} [${t.priority}]${deadlineStr}`);
    }
  }

  if (formattedEvents.length > 0) {
    lines.push(`Remaining schedule today:`);
    for (const e of formattedEvents) {
      lines.push(`  - ${e.title}: ${e.startTime}–${e.endTime}`);
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

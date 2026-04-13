// ============================================================
// User AI Context Snapshot
// Builds a concise summary of the user's current state
// (tasks, calendar, energy, activity) for injection into any
// AI call that needs situational awareness.
// ============================================================

import {
  getUser,
  getUserSettings,
  getPendingTasks,
  getTasksCompletedToday,
  getCalendarEventsByDateRange,
  getRecentTaskActivity,
} from "@/lib/db/queries";
import { getCurrentEnergy, getTimeOfDayBlock } from "@/lib/context/energy";
import { formatCurrentDateTime } from "@/lib/ai/prompts";
import { startOfDayInTz } from "@/lib/date-utils";
import type { EnergyProfile } from "@/types";

export interface UserSnapshot {
  timezone: string;
  currentTime: string;
  energyLevel: string;
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
  const [user, settings] = await Promise.all([
    getUser(userId),
    getUserSettings(userId),
  ]);

  const timezone = user?.timezone ?? "America/New_York";
  const currentTime = formatCurrentDateTime(timezone);

  const now = new Date();
  const endOfDay = new Date(startOfDayInTz(now, timezone).getTime() + 86_400_000 - 1);

  const [pendingTasks, completedToday, todayEvents, recentActivity] =
    await Promise.all([
      getPendingTasks(userId),
      getTasksCompletedToday(userId, timezone),
      getCalendarEventsByDateRange(userId, now, endOfDay),
      getRecentTaskActivity(userId, 5),
    ]);

  const energyProfile = (settings?.energyProfile as EnergyProfile) ?? null;
  const energyLevel = getCurrentEnergy(energyProfile, timezone);
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
    startTime: e.startTime.toLocaleTimeString("en-US", {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }),
    endTime: e.endTime.toLocaleTimeString("en-US", {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }),
  }));

  // Build the formatted text block
  const lines: string[] = [];
  lines.push(`--- User's Current Context ---`);
  lines.push(`Time: ${currentTime}`);
  lines.push(`Energy: ${energyLevel} (${timeBlock})`);
  lines.push(`Tasks completed today: ${completedToday.length}`);
  lines.push(`Pending tasks: ${pendingTasks.length}`);

  if (topPending.length > 0) {
    lines.push(`Top pending:`);
    for (const t of topPending) {
      const deadlineStr = t.deadline
        ? ` (due ${new Date(t.deadline).toLocaleDateString("en-US", { timeZone: timezone, month: "short", day: "numeric" })})`
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
  if (recentActivity.length > 0) {
    const lastAction = recentActivity[0];
    const lastActionTime = new Date(lastAction.createdAt).toLocaleTimeString(
      "en-US",
      { timeZone: timezone, hour: "numeric", minute: "2-digit", hour12: true }
    );
    lines.push(`Last activity: ${lastAction.action} at ${lastActionTime}`);
  }

  return {
    timezone,
    currentTime,
    energyLevel,
    pendingTaskCount: pendingTasks.length,
    completedTodayCount: completedToday.length,
    topPendingTasks: topPending,
    todayEvents: formattedEvents,
    formatted: lines.join("\n"),
  };
}

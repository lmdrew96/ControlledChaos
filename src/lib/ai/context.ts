// ============================================================
// Centralized AI Context Builder
// Assembles the full user context for injection into any AI prompt.
// This is the single source of truth for "what should the AI know?"
// ============================================================

import {
  getUser,
  getUserSettings,
  getPendingTasks,
  getTasksCompletedToday,
  getCalendarEventsByDateRange,
  getRecentTaskActivity,
  getActiveCrisisPlans,
  getUserLocation,
  getSavedLocations,
} from "@/lib/db/queries";
import { getCurrentEnergy, getTimeOfDayBlock } from "@/lib/context/energy";
import { formatCurrentDateTime } from "@/lib/ai/prompts";
import { startOfDayInTimezone, formatForDisplay, DISPLAY_TIME, DISPLAY_DATE } from "@/lib/timezone";
import type { EnergyLevel, EnergyProfile, PersonalityPrefs } from "@/types";

// ============================================================
// Types
// ============================================================

export interface AIContext {
  timezone: string;
  currentTime: string;
  currentDate: string;
  timeOfDay: string;
  energyLevel: EnergyLevel;
  personalityPrefs: PersonalityPrefs | null;

  // Location
  locationName: string | null;

  // Tasks
  pendingTaskCount: number;
  completedTodayCount: number;
  topTasks: Array<{
    title: string;
    priority: string;
    deadline: string | null;
    energyLevel: string;
  }>;

  // Calendar
  todayEvents: Array<{
    title: string;
    startTime: string;
    endTime: string;
  }>;

  // Crises
  activeCrises: Array<{
    taskName: string;
    deadline: string;
    panicLevel: string;
    progressPct: number;
  }>;

  // Activity patterns (from taskActivity.context)
  activityPatterns: string | null;

  /** Pre-formatted text block for injection into any AI prompt */
  formatted: string;
}

// ============================================================
// Options — callers can skip expensive queries they don't need
// ============================================================

export interface AIContextOptions {
  /** Skip calendar event fetch (e.g., if caller already has events) */
  skipCalendar?: boolean;
  /** Skip crisis plan fetch */
  skipCrises?: boolean;
  /** Override energy level (e.g., user-reported) */
  energyOverride?: EnergyLevel;
}

// ============================================================
// Builder
// ============================================================

export async function buildAIContext(
  userId: string,
  options: AIContextOptions = {}
): Promise<AIContext> {
  const [user, settings] = await Promise.all([
    getUser(userId),
    getUserSettings(userId),
  ]);

  const timezone = user?.timezone ?? "America/New_York";
  const currentTime = formatCurrentDateTime(timezone);
  const now = new Date();
  const endOfDay = new Date(
    startOfDayInTimezone(now, timezone).getTime() + 86_400_000 - 1
  );

  // Parallel fetch all context data
  const [pendingTasks, completedToday, todayEvents, recentActivity, crisisPlans, userLoc] =
    await Promise.all([
      getPendingTasks(userId),
      getTasksCompletedToday(userId, timezone),
      options.skipCalendar
        ? Promise.resolve([])
        : getCalendarEventsByDateRange(userId, now, endOfDay),
      getRecentTaskActivity(userId, 20),
      options.skipCrises
        ? Promise.resolve([])
        : getActiveCrisisPlans(userId),
      getUserLocation(userId),
    ]);

  const energyProfile = (settings?.energyProfile as EnergyProfile) ?? null;
  const energyLevel = getCurrentEnergy(energyProfile, timezone, options.energyOverride);
  const timeOfDay = getTimeOfDayBlock(timezone);
  const personalityPrefs = (settings?.personalityPrefs as PersonalityPrefs | null) ?? null;

  // Location
  const locationName = userLoc?.matchedLocationName ?? null;

  // Top 5 pending tasks
  const topTasks = pendingTasks.slice(0, 5).map((t) => ({
    title: t.title,
    priority: t.priority,
    deadline: t.deadline?.toISOString() ?? null,
    energyLevel: t.energyLevel,
  }));

  // Format events
  const formattedEvents = todayEvents.map((e) => ({
    title: e.title,
    startTime: formatForDisplay(e.startTime, timezone, DISPLAY_TIME),
    endTime: formatForDisplay(e.endTime, timezone, DISPLAY_TIME),
  }));

  // Format crises
  const activeCrises = crisisPlans.map((c) => {
    const totalTasks = (c.tasks as Array<unknown>).length;
    const progressPct =
      totalTasks > 0 ? Math.round((c.currentTaskIndex / totalTasks) * 100) : 0;
    return {
      taskName: c.taskName,
      deadline: c.deadline.toISOString(),
      panicLevel: c.panicLevel,
      progressPct,
    };
  });

  // Analyze activity patterns from recent task actions
  const activityPatterns = analyzeActivityPatterns(recentActivity);

  // Current date for display
  const currentDate = formatForDisplay(now, timezone, DISPLAY_DATE);

  // Build formatted text block
  const formatted = formatContextBlock({
    timezone,
    currentTime,
    currentDate,
    timeOfDay,
    energyLevel,
    locationName,
    pendingTaskCount: pendingTasks.length,
    completedTodayCount: completedToday.length,
    topTasks,
    todayEvents: formattedEvents,
    activeCrises,
    activityPatterns,
    personalityPrefs,
  });

  return {
    timezone,
    currentTime,
    currentDate,
    timeOfDay,
    energyLevel,
    personalityPrefs,
    locationName,
    pendingTaskCount: pendingTasks.length,
    completedTodayCount: completedToday.length,
    topTasks,
    todayEvents: formattedEvents,
    activeCrises,
    activityPatterns,
    formatted,
  };
}

// ============================================================
// Formatter — turns structured context into prompt-ready text
// ============================================================

export function formatContextBlock(ctx: Omit<AIContext, "formatted">): string {
  const lines: string[] = [];

  lines.push("## User Context");
  lines.push(`- Date: ${ctx.currentDate}`);
  lines.push(`- Time: ${ctx.currentTime}`);
  lines.push(`- Timezone: ${ctx.timezone}`);
  lines.push(`- Time of day: ${ctx.timeOfDay}`);
  lines.push(`- Energy level: ${ctx.energyLevel}`);
  lines.push(`- Location: ${ctx.locationName ?? "Unknown"}`);

  // Tasks summary
  lines.push(`- Pending tasks: ${ctx.pendingTaskCount}`);
  lines.push(`- Completed today: ${ctx.completedTodayCount}`);

  if (ctx.topTasks.length > 0) {
    lines.push("\n### Top Priority Tasks");
    for (const t of ctx.topTasks) {
      const deadlineStr = t.deadline
        ? ` (due ${formatForDisplay(new Date(t.deadline), ctx.timezone, DISPLAY_DATE)})`
        : "";
      lines.push(`- ${t.title} [${t.priority}, ${t.energyLevel} energy]${deadlineStr}`);
    }
  }

  // Today's schedule
  if (ctx.todayEvents.length > 0) {
    lines.push("\n### Today's Schedule");
    for (const e of ctx.todayEvents) {
      lines.push(`- ${e.startTime}–${e.endTime}: ${e.title}`);
    }
  } else {
    lines.push("\n### Today's Schedule\nNo events remaining today.");
  }

  // Active crises
  if (ctx.activeCrises.length > 0) {
    lines.push("\n### Active Crisis Plans");
    for (const c of ctx.activeCrises) {
      lines.push(
        `- "${c.taskName}" — ${c.panicLevel} (${c.progressPct}% done, deadline: ${formatForDisplay(new Date(c.deadline), ctx.timezone, DISPLAY_DATE)})`
      );
    }
  }

  // Activity patterns
  if (ctx.activityPatterns) {
    lines.push(`\n### Behavior Patterns\n${ctx.activityPatterns}`);
  }

  return lines.join("\n");
}

// ============================================================
// Activity Pattern Analysis
// ============================================================

interface ActivityRow {
  action: string;
  context: unknown;
  createdAt: Date;
}

function analyzeActivityPatterns(
  recentActivity: ActivityRow[]
): string | null {
  if (recentActivity.length < 5) return null;

  const patterns: string[] = [];

  // Count actions by type
  const actionCounts: Record<string, number> = {};
  for (const a of recentActivity) {
    actionCounts[a.action] = (actionCounts[a.action] ?? 0) + 1;
  }

  // Snooze-heavy pattern
  const snoozeCount = actionCounts["snoozed"] ?? 0;
  const rejectCount = actionCounts["rejected"] ?? 0;
  const completeCount = actionCounts["completed"] ?? 0;

  if (snoozeCount + rejectCount > completeCount && snoozeCount + rejectCount >= 3) {
    patterns.push(
      "User has been snoozing/rejecting more tasks than completing — may be in a low-energy or avoidance phase. Suggest smaller, easier tasks."
    );
  }

  if (completeCount >= 5) {
    patterns.push(
      "User is on a productivity streak — keep the momentum going with appropriately challenging tasks."
    );
  }

  // Analyze context fields from recent completions
  const completionContexts = recentActivity
    .filter((a) => a.action === "completed" && a.context)
    .map((a) => a.context as Record<string, string | number | null>);

  if (completionContexts.length >= 3) {
    // Energy pattern
    const energyCounts: Record<string, number> = {};
    for (const ctx of completionContexts) {
      const energy = ctx.energy as string | null;
      if (energy) energyCounts[energy] = (energyCounts[energy] ?? 0) + 1;
    }
    const topEnergy = Object.entries(energyCounts).sort((a, b) => b[1] - a[1])[0];
    if (topEnergy && topEnergy[1] >= 2) {
      patterns.push(`User tends to complete tasks during ${topEnergy[0]} energy periods.`);
    }

    // Time-of-day pattern
    const timeCounts: Record<string, number> = {};
    for (const ctx of completionContexts) {
      const tod = ctx.time_of_day as string | null;
      if (tod) timeCounts[tod] = (timeCounts[tod] ?? 0) + 1;
    }
    const topTime = Object.entries(timeCounts).sort((a, b) => b[1] - a[1])[0];
    if (topTime && topTime[1] >= 2) {
      patterns.push(`User is most productive during ${topTime[0]}.`);
    }
  }

  return patterns.length > 0 ? patterns.join("\n") : null;
}

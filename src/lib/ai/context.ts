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
import { isAssessmentTitle } from "@/lib/calendar/assessments";
import type { EnergyLevel, PersonalityPrefs } from "@/types";

const UPCOMING_HORIZON_DAYS = 7;
const URGENT_HORIZON_HOURS = 72;

// ============================================================
// Types
// ============================================================

export interface AIContext {
  timezone: string;
  currentTime: string;
  currentDate: string;
  timeOfDay: string;
  /** Most recent energy signal from Moments, or null if none logged recently. */
  energyLevel: EnergyLevel | null;
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
    source: string;
    isAssessment: boolean;
  }>;

  /** Canvas + user-created events for the next ~7 days (excluding today). */
  upcomingEvents: Array<{
    title: string;
    startTime: string;
    endTime: string;
    dateLabel: string;
    timeLabel: string;
    source: string;
    isAssessment: boolean;
  }>;

  /**
   * Tasks and events hitting in the next 72 hours, merged and sorted
   * chronologically. This is the AI's "urgent horizon" — external working
   * memory that must actively surface or it's just a prettier forgetting
   * machine. Injected at the top of the context block so the model sees
   * time-sensitive items before anything else.
   */
  urgent72hr: Array<{
    kind: "task" | "event";
    title: string;
    hitTime: string;
    dateLabel: string;
    timeLabel: string;
    /** For events: 'canvas' | 'controlledchaos'. For tasks: null. */
    source: string | null;
    /** Task priority (for tasks) or null (for events). */
    priority: string | null;
    /** True if a Canvas event with an assessment-keyword title. */
    isAssessment: boolean;
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
  const startOfToday = startOfDayInTimezone(now, timezone);
  const endOfDay = new Date(startOfToday.getTime() + 86_400_000 - 1);
  // End of user's local day + horizon days → inclusive of assessment events
  // scheduled late in the final day (e.g., an 11:59 PM Canvas assignment).
  const endOfHorizon = new Date(
    startOfToday.getTime() + (UPCOMING_HORIZON_DAYS + 1) * 86_400_000 - 1
  );

  // Parallel fetch all context data. Calendar fetch pulls the full horizon so
  // the AI sees upcoming Canvas assessments (quizzes/exams/assignments) that
  // would otherwise fall outside today's window.
  const [pendingTasks, completedToday, horizonEvents, recentActivity, crisisPlans, userLoc] =
    await Promise.all([
      getPendingTasks(userId),
      getTasksCompletedToday(userId, timezone),
      options.skipCalendar
        ? Promise.resolve([])
        : getCalendarEventsByDateRange(userId, now, endOfHorizon),
      getRecentTaskActivity(userId, 20),
      options.skipCrises
        ? Promise.resolve([])
        : getActiveCrisisPlans(userId),
      getUserLocation(userId),
    ]);

  const energyLevel = await getCurrentEnergy(userId, timezone, options.energyOverride);
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

  // Split horizon events into today vs. upcoming (day+1 through horizon end).
  const todayRaw = horizonEvents.filter((e) => e.startTime <= endOfDay);
  const upcomingRaw = horizonEvents.filter((e) => e.startTime > endOfDay);

  const formattedEvents = todayRaw.map((e) => ({
    title: e.title,
    startTime: formatForDisplay(e.startTime, timezone, DISPLAY_TIME),
    endTime: formatForDisplay(e.endTime, timezone, DISPLAY_TIME),
    source: e.source,
    isAssessment: e.source === "canvas" && isAssessmentTitle(e.title),
  }));

  // Build the 72-hour urgent horizon: any task (with a deadline) or event
  // landing within the next 72 hours, merged and sorted by hit-time. This
  // is additive to Top Priority / Today / Upcoming — it's a focused view
  // of what's immediately pressing regardless of type.
  const urgentCutoff = new Date(now.getTime() + URGENT_HORIZON_HOURS * 3_600_000);
  type UrgentItem = {
    kind: "task" | "event";
    title: string;
    hitTime: string;
    dateLabel: string;
    timeLabel: string;
    source: string | null;
    priority: string | null;
    isAssessment: boolean;
    _sort: number;
  };
  const urgentItems: UrgentItem[] = [];
  for (const t of pendingTasks) {
    if (!t.deadline) continue;
    if (t.deadline.getTime() > urgentCutoff.getTime()) continue;
    urgentItems.push({
      kind: "task",
      title: t.title,
      hitTime: t.deadline.toISOString(),
      dateLabel: formatForDisplay(t.deadline, timezone, DISPLAY_DATE),
      timeLabel: formatForDisplay(t.deadline, timezone, DISPLAY_TIME),
      source: null,
      priority: t.priority,
      isAssessment: false,
      _sort: t.deadline.getTime(),
    });
  }
  for (const e of horizonEvents) {
    if (e.startTime.getTime() > urgentCutoff.getTime()) continue;
    if (e.endTime.getTime() < now.getTime()) continue; // skip already-ended events
    urgentItems.push({
      kind: "event",
      title: e.title,
      hitTime: e.startTime.toISOString(),
      dateLabel: formatForDisplay(e.startTime, timezone, DISPLAY_DATE),
      timeLabel: formatForDisplay(e.startTime, timezone, DISPLAY_TIME),
      source: e.source,
      priority: null,
      isAssessment: e.source === "canvas" && isAssessmentTitle(e.title),
      _sort: e.startTime.getTime(),
    });
  }
  urgentItems.sort((a, b) => a._sort - b._sort);
  const urgent72hr = urgentItems.map(({ _sort: _unused, ...rest }) => rest);

  // Sort upcoming: assessments first (they drive ADHD planning), then
  // chronological within each group. Assessment-first surfacing is the core
  // point of including these in context.
  const formattedUpcoming = upcomingRaw
    .map((e) => ({
      title: e.title,
      startTime: e.startTime.toISOString(),
      endTime: e.endTime.toISOString(),
      dateLabel: formatForDisplay(e.startTime, timezone, DISPLAY_DATE),
      timeLabel: formatForDisplay(e.startTime, timezone, DISPLAY_TIME),
      source: e.source,
      isAssessment: e.source === "canvas" && isAssessmentTitle(e.title),
      _start: e.startTime,
    }))
    .sort((a, b) => {
      if (a.isAssessment !== b.isAssessment) return a.isAssessment ? -1 : 1;
      return a._start.getTime() - b._start.getTime();
    })
    .map(({ _start: _unused, ...rest }) => rest);

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
    upcomingEvents: formattedUpcoming,
    urgent72hr,
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
    upcomingEvents: formattedUpcoming,
    urgent72hr,
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
  lines.push(
    `- Energy level: ${ctx.energyLevel ?? "not logged recently"}`
  );
  lines.push(`- Location: ${ctx.locationName ?? "Unknown"}`);

  // Tasks summary
  lines.push(`- Pending tasks: ${ctx.pendingTaskCount}`);
  lines.push(`- Completed today: ${ctx.completedTodayCount}`);

  // ⚠️ Urgent horizon — placed FIRST so the model encounters time-sensitive
  // items before anything else. ADHD support relies on externalizing working
  // memory; passive storage isn't enough, it has to actively surface.
  if (ctx.urgent72hr.length > 0) {
    lines.push("\n### ⚠️ Next 72 Hours — prioritize these");
    lines.push(
      "The following tasks and events are hitting within 72 hours. Reference them whenever relevant; open dashboard briefings with what's most urgent."
    );
    for (const item of ctx.urgent72hr) {
      const kindTag = item.kind === "task" ? "[TASK]" : "[EVENT]";
      const metaParts: string[] = [];
      if (item.kind === "task" && item.priority) {
        metaParts.push(item.priority);
      }
      if (item.kind === "event" && item.source === "canvas") {
        metaParts.push(item.isAssessment ? "CANVAS ASSESSMENT ⚠️" : "CANVAS");
      }
      const metaStr = metaParts.length > 0 ? ` [${metaParts.join(", ")}]` : "";
      lines.push(
        `- ${item.dateLabel} ${item.timeLabel} · ${kindTag} ${item.title}${metaStr}`
      );
    }
  }

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
      const tag = e.isAssessment ? " ⚠️ [CANVAS ASSESSMENT]" : "";
      lines.push(`- ${e.startTime}–${e.endTime}: ${e.title}${tag}`);
    }
  } else {
    lines.push("\n### Today's Schedule\nNo events remaining today.");
  }

  // Upcoming (next 7 days, excluding today). Canvas assessments sort first so
  // the AI sees them before non-urgent items, making it much more likely to
  // flag quizzes/exams/assignments in recommendations.
  if (ctx.upcomingEvents.length > 0) {
    const assessments = ctx.upcomingEvents.filter((e) => e.isAssessment);
    const other = ctx.upcomingEvents.filter((e) => !e.isAssessment);

    lines.push("\n### Upcoming (Next 7 Days)");
    if (assessments.length > 0) {
      lines.push("**Canvas assessments — prioritize these in recommendations:**");
      for (const e of assessments) {
        lines.push(`- ⚠️ ${e.dateLabel} ${e.timeLabel}: ${e.title} [CANVAS]`);
      }
    }
    if (other.length > 0) {
      if (assessments.length > 0) lines.push("\n**Other upcoming events:**");
      for (const e of other) {
        const sourceTag = e.source === "canvas" ? " [CANVAS]" : "";
        lines.push(`- ${e.dateLabel} ${e.timeLabel}: ${e.title}${sourceTag}`);
      }
    }
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

import {
  getLastTaskCompletion,
  getPendingTasks,
  getRecentNotifications,
  getRecentTaskActivity,
} from "@/lib/db/queries";
import { startOfDayInTz } from "@/lib/date-utils";
import { callSonnet } from "@/lib/ai";
import { buildInactivityNudgePrompt, buildPushNotificationPrompt } from "@/lib/ai/prompts";
import { enforceWordLimit } from "@/lib/ai/validate";
import type { NotificationAssertiveness, NotificationPrefs, PersonalityPrefs } from "@/types";

interface DeadlineWarning {
  taskId: string;
  taskTitle: string;
  level: "24h" | "2h" | "30min";
  deadline: Date;
}

interface ScheduledAlert {
  taskId: string;
  taskTitle: string;
  scheduledFor: Date;
}

interface MissedScheduledAlert {
  taskId: string;
  taskTitle: string;
  scheduledFor: Date;
}

const NOTIFICATION_CAPS: Record<NotificationAssertiveness, number> = {
  gentle: 4,
  balanced: 6,
  assertive: 8,
};

export function getAssertivenessMode(prefs: NotificationPrefs | null | undefined): NotificationAssertiveness {
  const mode = prefs?.assertivenessMode;
  if (mode === "gentle" || mode === "balanced" || mode === "assertive") return mode;
  return "balanced";
}

export function getDailyPushCap(mode: NotificationAssertiveness): number {
  return NOTIFICATION_CAPS[mode];
}

export async function getPushNotificationsSentToday(userId: string, timezone = "America/New_York"): Promise<number> {
  const recent = await getRecentNotifications(userId, 100);
  const todayStart = startOfDayInTz(new Date(), timezone);

  return recent.filter((n) => n.type === "push" && n.sentAt && new Date(n.sentAt) >= todayStart).length;
}

/**
 * Check for tasks with upcoming deadlines that need push warnings.
 * Returns tasks at 24h, 2h, and 30min thresholds.
 */
export async function getDeadlineWarnings(
  userId: string
): Promise<DeadlineWarning[]> {
  const tasks = await getPendingTasks(userId);
  const now = Date.now();
  const warnings: DeadlineWarning[] = [];

  for (const task of tasks) {
    if (!task.deadline) continue;

    const deadlineMs = new Date(task.deadline).getTime();
    const diff = deadlineMs - now;

    if (diff <= 0) continue; // Already past

    if (diff <= 30 * 60 * 1000) {
      warnings.push({
        taskId: task.id,
        taskTitle: task.title,
        level: "30min",
        deadline: task.deadline,
      });
    } else if (diff <= 2 * 60 * 60 * 1000) {
      warnings.push({
        taskId: task.id,
        taskTitle: task.title,
        level: "2h",
        deadline: task.deadline,
      });
    } else if (diff <= 24 * 60 * 60 * 1000) {
      warnings.push({
        taskId: task.id,
        taskTitle: task.title,
        level: "24h",
        deadline: task.deadline,
      });
    }
  }

  // Sort by nearest deadline first so the most urgent warnings fire first
  warnings.sort((a, b) => a.deadline.getTime() - b.deadline.getTime());

  return warnings;
}

/**
 * Check for tasks with scheduledFor in the next 15 minutes.
 */
export async function getScheduledTaskAlerts(
  userId: string
): Promise<ScheduledAlert[]> {
  const tasks = await getPendingTasks(userId);
  const now = Date.now();
  const alerts: ScheduledAlert[] = [];

  for (const task of tasks) {
    if (!task.scheduledFor) continue;

    const scheduledMs = new Date(task.scheduledFor).getTime();
    const diff = scheduledMs - now;

    // Alert if scheduled within the next 15 minutes (and not past)
    if (diff > 0 && diff <= 15 * 60 * 1000) {
      alerts.push({
        taskId: task.id,
        taskTitle: task.title,
        scheduledFor: task.scheduledFor,
      });
    }
  }

  return alerts;
}

/**
 * Check for tasks whose scheduled start time has already passed and may need a stronger follow-up.
 * We only include tasks that are 20-120 minutes overdue to avoid stale noise.
 */
export async function getMissedScheduledTaskAlerts(
  userId: string
): Promise<MissedScheduledAlert[]> {
  const tasks = await getPendingTasks(userId);
  const now = Date.now();
  const alerts: MissedScheduledAlert[] = [];

  for (const task of tasks) {
    if (!task.scheduledFor) continue;

    const scheduledMs = new Date(task.scheduledFor).getTime();
    const overdueMs = now - scheduledMs;

    if (overdueMs >= 20 * 60 * 1000 && overdueMs <= 120 * 60 * 1000) {
      alerts.push({
        taskId: task.id,
        taskTitle: task.title,
        scheduledFor: task.scheduledFor,
      });
    }
  }

  return alerts;
}

/**
 * Determine if the user should get an idle check-in.
 * Criteria: no task activity today AND it's past 11am in their timezone.
 */
export async function shouldSendIdleCheckin(
  userId: string,
  timezone: string
): Promise<{ shouldSend: boolean; activityLevel: "active" | "idle" }> {
  // Check if it's past 11am in user's timezone
  const now = new Date();
  const hourStr = now.toLocaleString("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    hour12: false,
  });
  const currentHour = parseInt(hourStr, 10);
  // Morning window: 11am–2:59pm only. Afternoon takes over at 3pm.
  if (currentHour < 11 || currentHour >= 15) return { shouldSend: false, activityLevel: "idle" };

  const recentActivity = await getRecentTaskActivity(userId, 1);
  if (recentActivity.length === 0) return { shouldSend: true, activityLevel: "idle" };

  const lastActivity = new Date(recentActivity[0].createdAt);
  const lastActivityDateStr = lastActivity.toLocaleDateString("en-CA", { timeZone: timezone });
  const todayStr = now.toLocaleDateString("en-CA", { timeZone: timezone });

  const activityLevel = lastActivityDateStr === todayStr ? "active" : "idle";
  return { shouldSend: true, activityLevel };
}

/**
 * Check if a notification with the given dedup key was already sent today.
 */
export async function hasBeenNotifiedToday(
  userId: string,
  dedupKey: string,
  timezone = "America/New_York"
): Promise<boolean> {
  const recent = await getRecentNotifications(userId, 100);
  const todayStart = startOfDayInTz(new Date(), timezone);

  return recent.some((n) => {
    if (!n.sentAt || new Date(n.sentAt) < todayStart) return false;
    const content = n.content as Record<string, unknown> | null;
    return content?.dedupKey === dedupKey;
  });
}

/**
 * Check if a notification with the given dedup key has EVER been sent.
 * Used for nudges where we track per-inactivity-streak, not per-day.
 */
export async function hasEverBeenNotified(
  userId: string,
  dedupKey: string
): Promise<boolean> {
  const recent = await getRecentNotifications(userId, 200);
  return recent.some((n) => {
    const content = n.content as Record<string, unknown> | null;
    return content?.dedupKey === dedupKey;
  });
}

type PushNotificationContext =
  | { type: "deadline_24h"; taskTitle: string }
  | { type: "deadline_2h"; taskTitle: string }
  | { type: "deadline_30min"; taskTitle: string }
  | { type: "scheduled"; taskTitle: string }
  | { type: "scheduled_missed"; taskTitle: string }
  | { type: "idle_checkin"; topTaskTitle?: string; activityLevel: "active" | "idle" }
  | { type: "idle_checkin_afternoon"; topTaskTitle?: string; activityLevel: "active" | "idle" }
  | { type: "idle_checkin_evening"; topTaskTitle?: string; activityLevel: "active" | "idle" }
  | { type: "location_arrival"; locationName: string; taskTitle: string; taskCount: number }
  | { type: "location_departure_nearby"; locationName: string; nearbyLocationName: string; taskTitle: string };

const PUSH_FALLBACKS: Record<PushNotificationContext["type"], string> = {
  deadline_24h: "Heads up — something's due tomorrow. You've got this.",
  deadline_2h: "Two hours out. You can still knock this one out.",
  deadline_30min: "30 minutes. This is happening.",
  scheduled: "You planned this. Past-you had your back.",
  scheduled_missed: "That planned start time slipped. Pick it back up now or snooze with intent.",
  idle_checkin: "Got anything on your mind? Quick brain dump?",
  idle_checkin_afternoon: "Afternoon's ticking. One small thing is better than nothing.",
  idle_checkin_evening: "It's 7:00 and today's still open. Want to close one task before tonight?",
  location_arrival: "You're here — might as well knock this out.",
  location_departure_nearby: "Before you head home, there's something nearby.",
};

/**
 * Generate a push notification message via Claude Haiku.
 * Falls back to a hardcoded string if the AI call fails.
 *
 * @param userLocation - The user's current matched location name (e.g. "Home", "Campus").
 *   When provided, the AI can weave it in naturally for extra context.
 */
export async function generatePushMessage(
  ctx: PushNotificationContext,
  prefs: PersonalityPrefs | null = null,
  timezone: string = "America/New_York",
  mode: NotificationAssertiveness = "balanced",
  userLocation?: string,
  scheduleContext?: string
): Promise<string> {
  let userMsg: string;
  if (ctx.type === "idle_checkin") {
    userMsg = ctx.topTaskTitle
      ? `Type: idle_checkin\nActivity: ${ctx.activityLevel}\nTop pending task: "${ctx.topTaskTitle}"`
      : `Type: idle_checkin\nActivity: ${ctx.activityLevel}`;
  } else if (ctx.type === "idle_checkin_afternoon") {
    userMsg = ctx.topTaskTitle
      ? `Type: idle_checkin_afternoon\nActivity: ${ctx.activityLevel}\nTop pending task: "${ctx.topTaskTitle}"`
      : `Type: idle_checkin_afternoon\nActivity: ${ctx.activityLevel}`;
  } else if (ctx.type === "idle_checkin_evening") {
    userMsg = ctx.topTaskTitle
      ? `Type: idle_checkin_evening\nActivity: ${ctx.activityLevel}\nTop pending task: "${ctx.topTaskTitle}"`
      : `Type: idle_checkin_evening\nActivity: ${ctx.activityLevel}`;
  } else if (ctx.type === "location_arrival") {
    userMsg = `Type: location_arrival\nLocation: "${ctx.locationName}"\nTask: "${ctx.taskTitle}"\nTotal matching tasks: ${ctx.taskCount}`;
  } else if (ctx.type === "location_departure_nearby") {
    userMsg = `Type: location_departure_nearby\nLeft: "${ctx.locationName}"\nNearby: "${ctx.nearbyLocationName}"\nTask: "${ctx.taskTitle}"`;
  } else {
    userMsg = `Type: ${ctx.type}\nTask: "${ctx.taskTitle}"`;
  }

  // Append the user's current location so the AI can reference it naturally
  if (userLocation && ctx.type !== "location_arrival" && ctx.type !== "location_departure_nearby") {
    userMsg += `\nUser's current location: "${userLocation}"`;
  }

  // Append schedule/task context so the AI knows what the user's day looks like
  if (scheduleContext) {
    userMsg += `\n\n${scheduleContext}`;
  }

  try {
    const { text } = await callSonnet({
      system: buildPushNotificationPrompt(prefs, timezone, mode),
      user: userMsg,
      maxTokens: 60,
    });

    const cleaned = text.trim().replace(/^["']|["']$/g, "");
    return enforceWordLimit(cleaned, 35) || PUSH_FALLBACKS[ctx.type];
  } catch (error) {
    console.error(`[Push] Haiku call failed for ${ctx.type}, using fallback:`, error);
    if (
      ctx.type === "deadline_24h" ||
      ctx.type === "deadline_2h" ||
      ctx.type === "deadline_30min" ||
      ctx.type === "scheduled" ||
      ctx.type === "scheduled_missed"
    ) {
      const fallback = PUSH_FALLBACKS[ctx.type];
      return fallback
        .replace("something's due", `${ctx.taskTitle} is due`)
        .replace("You planned this", `Time for ${ctx.taskTitle}`);
    }
    return PUSH_FALLBACKS[ctx.type];
  }
}

export type NudgeTier = 1 | 2 | 3;

// Fallback messages used when the Haiku call fails
const NUDGE_FALLBACKS: Record<NudgeTier, string> = {
  1: "You've been resting for three days. While I applaud your commitment to self care, I do believe you have shit to do.",
  2: "I know things get rough sometimes. Don't let it pile up — let's just do one thing. One step at a time.",
  3: "BRUH.",
};

/**
 * Generate a nudge message for the given inactivity tier using Claude Haiku.
 * Falls back to a hardcoded message if the AI call fails.
 */
export async function generateNudgeMessage(
  tier: NudgeTier,
  hoursInactive: number,
  prefs: PersonalityPrefs | null = null,
  timezone: string = "America/New_York",
  mode: NotificationAssertiveness = "balanced",
  userLocation?: string,
  scheduleContext?: string
): Promise<string> {
  try {
    let userMsg = `Tier: ${tier}\nHours inactive: ${Math.round(hoursInactive)}`;
    if (userLocation) userMsg += `\nUser's current location: "${userLocation}"`;
    if (scheduleContext) userMsg += `\n\n${scheduleContext}`;
    const { text } = await callSonnet({
      system: buildInactivityNudgePrompt(prefs, timezone, mode),
      user: userMsg,
      maxTokens: 80,
    });

    const cleaned = text.trim().replace(/^["']|["']$/g, "");
    const wordLimit = tier === 3 ? 10 : 40;
    return enforceWordLimit(cleaned, wordLimit) || NUDGE_FALLBACKS[tier];
  } catch (error) {
    console.error(`[Nudge] Haiku call failed for tier ${tier}, using fallback:`, error);
    return NUDGE_FALLBACKS[tier];
  }
}

/**
 * Returns the title of the top pending task to surface in idle check-ins.
 * getPendingTasks already sorts deadline-first (nearest deadline → no deadline → newest).
 *
 * When the user's current location is known, prefer a task tagged for that
 * location (still respecting deadline ordering within matched tasks).
 */
export async function getTopPendingTaskTitle(
  userId: string,
  locationName?: string
): Promise<string | undefined> {
  const pending = await getPendingTasks(userId);

  if (locationName) {
    const locationTask = pending.find((t) =>
      t.locationTags?.some(
        (tag) => tag.toLowerCase() === locationName.toLowerCase()
      )
    );
    if (locationTask) return locationTask.title;
  }

  return pending[0]?.title;
}

/**
 * Determine if the user should get an afternoon idle check-in.
 * Criteria: no task activity today AND it's past 3pm in their timezone.
 * (Complements the 11am morning check-in with a later nudge.)
 */
export async function shouldSendAfternoonCheckin(
  userId: string,
  timezone: string
): Promise<{ shouldSend: boolean; activityLevel: "active" | "idle" }> {
  const now = new Date();
  const hourStr = now.toLocaleString("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    hour12: false,
  });
  const currentHour = parseInt(hourStr, 10);
  // Afternoon window: 3pm–6:59pm only. Evening takes over at 7pm.
  if (currentHour < 15 || currentHour >= 19) return { shouldSend: false, activityLevel: "idle" };

  const recentActivity = await getRecentTaskActivity(userId, 1);
  if (recentActivity.length === 0) return { shouldSend: true, activityLevel: "idle" };

  const lastActivity = new Date(recentActivity[0].createdAt);
  const lastActivityDateStr = lastActivity.toLocaleDateString("en-CA", { timeZone: timezone });
  const todayStr = now.toLocaleDateString("en-CA", { timeZone: timezone });

  const activityLevel = lastActivityDateStr === todayStr ? "active" : "idle";
  return { shouldSend: true, activityLevel };
}

/**
 * Determine if the user should get an evening idle check-in.
 * Criteria: it's 7:00pm+ and the user gets an evening check-in regardless of activity level.
 */
export async function getEveningCheckinStatus(
  userId: string,
  timezone: string
): Promise<{ shouldSend: boolean; reason: string; activityLevel: "active" | "idle"; hoursSinceLastActivity?: number }> {
  const now = new Date();
  const timeStr = now.toLocaleTimeString("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  if (timeStr < "19:00") {
    return { shouldSend: false, reason: "before_window", activityLevel: "idle" };
  }

  const recentActivity = await getRecentTaskActivity(userId, 1);
  if (recentActivity.length === 0) {
    return { shouldSend: true, reason: "no_activity_recorded", activityLevel: "idle" };
  }

  const lastActivity = new Date(recentActivity[0].createdAt);
  const lastActivityDateStr = lastActivity.toLocaleDateString("en-CA", { timeZone: timezone });
  const todayStr = now.toLocaleDateString("en-CA", { timeZone: timezone });

  if (lastActivityDateStr !== todayStr) {
    return { shouldSend: true, reason: "no_activity_today", activityLevel: "idle" };
  }

  const hoursSinceLastActivity = (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60);
  // Active recently — still send, but with encouraging "keep going" energy
  return {
    shouldSend: true,
    reason: hoursSinceLastActivity >= 3 ? "inactive_3h_plus" : "active_today",
    activityLevel: hoursSinceLastActivity >= 3 ? "idle" : "active",
    hoursSinceLastActivity,
  };
}

export async function shouldSendEveningCheckin(
  userId: string,
  timezone: string
): Promise<boolean> {
  const status = await getEveningCheckinStatus(userId, timezone);
  return status.shouldSend;
}

/**
 * Determines which inactivity nudge tier a user is in based on their last task completion.
 * Returns null if the user doesn't qualify for a nudge.
 *
 * Tiers:
 *  1 → 72–96h since last completion (empathetic + chaotic)
 *  2 → 96–120h (urgent but supportive)
 *  3 → 120h+ (BRUH)
 *
 * The streakKey is derived from the last completion date and anchors dedup keys
 * so each new inactivity streak gets its own set of tier notifications.
 */
export async function getInactivityNudgeTier(
  userId: string
): Promise<{ tier: NudgeTier; streakKey: string; hoursInactive: number } | null> {
  const lastCompletion = await getLastTaskCompletion(userId);
  const now = Date.now();

  let hoursInactive: number;
  let streakKey: string;

  if (!lastCompletion) {
    // Never completed — only nudge if they have pending tasks (not a brand-new user)
    const pending = await getPendingTasks(userId);
    if (pending.length === 0) return null;
    hoursInactive = 999;
    streakKey = "never";
  } else {
    hoursInactive = (now - new Date(lastCompletion).getTime()) / (1000 * 60 * 60);
    streakKey = new Date(lastCompletion).toISOString().slice(0, 10);
  }

  if (hoursInactive < 72) return null;

  const tier: NudgeTier = hoursInactive >= 120 ? 3 : hoursInactive >= 96 ? 2 : 1;

  return { tier, streakKey, hoursInactive };
}

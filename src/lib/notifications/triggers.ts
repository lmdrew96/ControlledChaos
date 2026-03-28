import {
  getLastTaskCompletion,
  getPendingTasks,
  getRecentNotifications,
  getRecentTaskActivity,
} from "@/lib/db/queries";
import { callHaiku } from "@/lib/ai";
import { INACTIVITY_NUDGE_PROMPT } from "@/lib/ai/prompts";
import { enforceWordLimit } from "@/lib/ai/validate";

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
 * Determine if the user should get an idle check-in.
 * Criteria: no task activity today AND it's past 11am in their timezone.
 */
export async function shouldSendIdleCheckin(
  userId: string,
  timezone: string
): Promise<boolean> {
  // Check if it's past 11am in user's timezone
  const now = new Date();
  const hourStr = now.toLocaleString("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    hour12: false,
  });
  const currentHour = parseInt(hourStr, 10);
  if (currentHour < 11) return false;

  // Check for any activity today
  const recentActivity = await getRecentTaskActivity(userId, 1);
  if (recentActivity.length === 0) return true;

  const lastActivity = new Date(recentActivity[0].createdAt);
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  return lastActivity < todayStart;
}

/**
 * Check if a notification with the given dedup key was already sent today.
 */
export async function hasBeenNotifiedToday(
  userId: string,
  dedupKey: string
): Promise<boolean> {
  const recent = await getRecentNotifications(userId, 100);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

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
  hoursInactive: number
): Promise<string> {
  try {
    const { text } = await callHaiku({
      system: INACTIVITY_NUDGE_PROMPT,
      user: `Tier: ${tier}\nHours inactive: ${Math.round(hoursInactive)}`,
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

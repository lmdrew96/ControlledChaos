import {
  getPendingTasks,
  getRecentNotifications,
  getRecentTaskActivity,
} from "@/lib/db/queries";

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

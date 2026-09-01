import { startOfDayInTimezone, todayInTimezone } from "@/lib/timezone";
import { Resend } from "resend";
import { render } from "@react-email/components";
import { callSonnet } from "@/lib/ai";
import {
  buildMorningDigestPrompt,
  buildEveningDigestPrompt,
  formatCurrentDateTime,
} from "@/lib/ai/prompts";
import { enforceWordLimit } from "@/lib/ai/validate";
import { compareBySoonestTime } from "@/lib/tasks/task-times";
import {
  getUser,
  getUserSettings,
  getPendingTasks,
  getTasksCompletedToday,
  getCalendarEventsByDateRange,
  getActiveCrisisPlans,
  getRecentTaskActivity,
  createNotification,
  getUserLocation,
  isLocationStale,
} from "@/lib/db/queries";
import { MorningDigestEmail } from "./emails/morning-digest";
import { EveningDigestEmail } from "./emails/evening-digest";
import type { PersonalityPrefs } from "@/types";

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY not configured");
  return new Resend(key);
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://controlledchaos.adhdesigns.dev";
const FROM_EMAIL = process.env.EMAIL_FROM ?? "ControlledChaos <nae@adhdesigns.dev>";

/**
 * Send the morning digest email for a user.
 */
export async function sendMorningDigest(userId: string): Promise<boolean> {
  const [user, settings, userLoc] = await Promise.all([
    getUser(userId),
    getUserSettings(userId),
    getUserLocation(userId),
  ]);
  if (!user?.email) return false;

  const timezone = user.timezone ?? "America/New_York";
  // Digest is generated on a schedule, not while the app is necessarily open — a
  // stale (app-not-foregrounded) location is worse than none for the AI's copy.
  const locationName =
    userLoc?.matchedLocationName && !isLocationStale(userLoc.updatedAt)
      ? userLoc.matchedLocationName
      : null;
  const now = new Date();

  // Today's events
  const todayStart = startOfDayInTimezone(now, timezone);
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const events = await getCalendarEventsByDateRange(userId, todayStart, todayEnd);

  // Pending tasks, soonest claim on attention first — whichever of the hard
  // deadline, soft target or planned start lands first — then by priority.
  const pending = await getPendingTasks(userId);
  const priorityOrder = { urgent: 0, important: 1, normal: 2, someday: 3 };
  const sorted = [...pending].sort((a, b) => {
    const byTime = compareBySoonestTime(a, b);
    if (byTime !== 0) return byTime;
    return (
      (priorityOrder[a.priority as keyof typeof priorityOrder] ?? 3) -
      (priorityOrder[b.priority as keyof typeof priorityOrder] ?? 3)
    );
  });
  const topTasks = sorted.slice(0, 5);

  // Deadlines this week — HARD ones only. A self-imposed target has no
  // external consequence and does not belong in a list headed "Deadlines".
  const weekEnd = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  const withDeadlines = pending.filter(
    (t) => t.deadline && new Date(t.deadline) <= weekEnd
  );

  // Soft targets land in their own list, with their own wording.
  const targetsThisWeek = pending.filter(
    (t) => t.targetDate && new Date(t.targetDate) <= weekEnd
  );

  // Work they planned to start today. Their plan, not a due date.
  const plannedToday = pending
    .filter((t) => t.scheduledFor && t.scheduledFor >= todayStart && t.scheduledFor < todayEnd)
    .sort((a, b) => a.scheduledFor!.getTime() - b.scheduledFor!.getTime());

  // Fetch crises and recent activity for holistic context
  const [activeCrises, recentActivity] = await Promise.all([
    getActiveCrisisPlans(userId),
    getRecentTaskActivity(userId, 10),
  ]);

  // Quick behavior signal
  const snoozeRejectCount = recentActivity.filter(
    (a) => a.action === "snoozed" || a.action === "rejected"
  ).length;
  const completeCount = recentActivity.filter(
    (a) => a.action === "completed"
  ).length;
  const behaviorSignal =
    snoozeRejectCount > completeCount && snoozeRejectCount >= 3
      ? "User has been in an avoidance phase recently — be encouraging, not pushy."
      : completeCount >= 4
        ? "User is on a productivity streak — keep the momentum."
        : null;

  // Generate AI note
  const context = [
    `Current date/time: ${formatCurrentDateTime(timezone)}`,
    `User's name: ${user.displayName ?? "there"}`,
    locationName ? `User's last known location: ${locationName}` : null,
    `Today's events: ${events.map((e) => `${formatTime(e.startTime, timezone)} ${e.title}`).join(", ") || "None"}`,
    `Top tasks: ${topTasks.map((t) => `${t.title} (${t.priority})${t.locationTags?.length ? ` [${t.locationTags.join(", ")}]` : ""}`).join(", ") || "None"}`,
    `HARD deadlines this week (real external consequences): ${withDeadlines.map((t) => `${t.title} due ${formatDate(t.deadline!, timezone)}`).join(", ") || "None"}`,
    `SOFT self-imposed targets this week (NOT due — never call these "due"): ${targetsThisWeek.map((t) => `${t.title}, they aimed for ${formatDate(t.targetDate!, timezone)}`).join(", ") || "None"}`,
    `Planned to start today (their own plan, not a deadline): ${plannedToday.map((t) => `${formatTime(t.scheduledFor!, timezone)} ${t.title}`).join(", ") || "None"}`,
    activeCrises.length > 0
      ? `Active crises: ${activeCrises.map((c) => `"${c.taskName}" (${c.panicLevel})`).join(", ")}`
      : null,
    behaviorSignal,
  ]
    .filter(Boolean)
    .join("\n");

  const aiResult = await callSonnet({
    system: buildMorningDigestPrompt(settings?.personalityPrefs as PersonalityPrefs | null ?? null),
    user: context,
    maxTokens: 256,
  });

  const aiNote = enforceWordLimit(aiResult.text, 80);

  const html = await render(
    MorningDigestEmail({
      userName: user.displayName ?? "",
      aiNote,
      todayEvents: events.map((e) => ({
        title: e.title,
        time: formatTime(e.startTime, timezone),
      })),
      topTasks: topTasks.map((t) => ({
        title: t.title,
        priority: t.priority,
        deadline: t.deadline ? formatDate(t.deadline, timezone) : undefined,
        target: t.targetDate ? formatDate(t.targetDate, timezone) : undefined,
        plannedAt:
          t.scheduledFor && t.scheduledFor >= todayStart && t.scheduledFor < todayEnd
            ? formatTime(t.scheduledFor, timezone)
            : undefined,
      })),
      deadlinesThisWeek: withDeadlines.map((t) => ({
        title: t.title,
        deadline: formatDate(t.deadline!, timezone),
      })),
      targetsThisWeek: targetsThisWeek.map((t) => ({
        title: t.title,
        target: formatDate(t.targetDate!, timezone),
      })),
      settingsUrl: `${APP_URL}/settings`,
    })
  );

  try {
    const result = await getResend().emails.send({
      from: FROM_EMAIL,
      to: user.email,
      subject: `Your morning game plan — ${formatShortDate(now, timezone)}`,
      html,
    });

    console.log(`[Email] Morning digest for ${userId}: from=${FROM_EMAIL} to=${user.email}`, JSON.stringify(result));

    if (result.error) {
      console.error(`[Email] Resend rejected morning digest:`, result.error);
      return false;
    }

    await createNotification(userId, "email", {
      type: "morning_digest",
      dedupKey: `morning-digest-${todayInTimezone(timezone)}`,
    });

    return true;
  } catch (err) {
    console.error(`[Email] Morning digest failed for ${userId}:`, err);
    return false;
  }
}

/**
 * Spell out which of a task's three times exist, in words the model can't
 * flatten into "due". Empty string when the task carries none of them.
 */
function describeTaskTimes(
  task: { deadline: Date | null; targetDate: Date | null; scheduledFor: Date | null },
  timezone: string
): string {
  const parts: string[] = [];
  if (task.deadline) parts.push(`HARD deadline ${formatDate(task.deadline, timezone)}`);
  if (task.targetDate) {
    parts.push(
      `SOFT self-imposed target ${formatDate(task.targetDate, timezone)} — not due, do not say "due"`
    );
  }
  if (task.scheduledFor) {
    parts.push(`planned to start ${formatTime(task.scheduledFor, timezone)}`);
  }
  return parts.length > 0 ? ` — ${parts.join("; ")}` : "";
}

/**
 * Send the evening digest email for a user.
 */
export async function sendEveningDigest(userId: string): Promise<boolean> {
  const [user, settings, userLoc] = await Promise.all([
    getUser(userId),
    getUserSettings(userId),
    getUserLocation(userId),
  ]);
  if (!user?.email) return false;

  const timezone = user.timezone ?? "America/New_York";
  const locationName =
    userLoc?.matchedLocationName && !isLocationStale(userLoc.updatedAt)
      ? userLoc.matchedLocationName
      : null;
  const now = new Date();

  // Tasks completed today
  const completed = await getTasksCompletedToday(userId, timezone);

  // Pending tasks for tomorrow's priority — soonest of the three times first,
  // then priority.
  const pending = await getPendingTasks(userId);
  const priorityOrder = { urgent: 0, important: 1, normal: 2, someday: 3 };
  const sorted = [...pending].sort((a, b) => {
    const byTime = compareBySoonestTime(a, b);
    if (byTime !== 0) return byTime;
    return (
      (priorityOrder[a.priority as keyof typeof priorityOrder] ?? 3) -
      (priorityOrder[b.priority as keyof typeof priorityOrder] ?? 3)
    );
  });
  const tomorrowPriority = sorted[0] ?? null;

  // Tomorrow's calendar for context
  const todayStart = startOfDayInTimezone(now, timezone);
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowEnd = new Date(tomorrowStart.getTime() + 24 * 60 * 60 * 1000);

  // Work already planned for tomorrow — their plan, not a due date.
  const plannedTomorrow = pending
    .filter((t) => t.scheduledFor && t.scheduledFor >= tomorrowStart && t.scheduledFor < tomorrowEnd)
    .sort((a, b) => a.scheduledFor!.getTime() - b.scheduledFor!.getTime());
  const tomorrowEvents = await getCalendarEventsByDateRange(
    userId,
    tomorrowStart,
    tomorrowEnd
  );

  // Fetch crises and recent activity for holistic context
  const [activeCrises, recentActivity] = await Promise.all([
    getActiveCrisisPlans(userId),
    getRecentTaskActivity(userId, 10),
  ]);

  const snoozeRejectCount = recentActivity.filter(
    (a) => a.action === "snoozed" || a.action === "rejected"
  ).length;
  const completeCount = recentActivity.filter(
    (a) => a.action === "completed"
  ).length;
  const behaviorSignal =
    snoozeRejectCount > completeCount && snoozeRejectCount >= 3
      ? "User has been in an avoidance phase — be gentle and encouraging."
      : completeCount >= 4
        ? "User had a productive streak — celebrate it."
        : null;

  // Generate AI note
  const context = [
    `Current date/time: ${formatCurrentDateTime(timezone)}`,
    `User's name: ${user.displayName ?? "there"}`,
    locationName ? `User's last known location: ${locationName}` : null,
    `Tasks completed today: ${completed.map((t) => t.title).join(", ") || "None"}`,
    `Tomorrow's top priority: ${
      tomorrowPriority
        ? `${tomorrowPriority.title} (${tomorrowPriority.priority})${describeTaskTimes(tomorrowPriority, timezone)}`
        : "Nothing urgent"
    }`,
    `Tomorrow's calendar: ${tomorrowEvents.length > 0 ? tomorrowEvents.map((e) => `${formatTime(e.startTime, timezone)} ${e.title}`).join(", ") : "Nothing scheduled"}`,
    `Already planned for tomorrow (their own plan, not deadlines): ${plannedTomorrow.map((t) => `${formatTime(t.scheduledFor!, timezone)} ${t.title}`).join(", ") || "Nothing planned yet"}`,
    activeCrises.length > 0
      ? `Active crises: ${activeCrises.map((c) => `"${c.taskName}" (${c.panicLevel})`).join(", ")}`
      : null,
    behaviorSignal,
  ]
    .filter(Boolean)
    .join("\n");

  const aiResult = await callSonnet({
    system: buildEveningDigestPrompt(settings?.personalityPrefs as PersonalityPrefs | null ?? null),
    user: context,
    maxTokens: 256,
  });

  const aiNote = enforceWordLimit(aiResult.text, 80);

  const html = await render(
    EveningDigestEmail({
      userName: user.displayName ?? "",
      aiNote,
      completedTasks: completed.map((t) => ({ title: t.title })),
      tomorrowPriority: tomorrowPriority
        ? {
            title: tomorrowPriority.title,
            deadline: tomorrowPriority.deadline
              ? formatDate(tomorrowPriority.deadline, timezone)
              : undefined,
            target: tomorrowPriority.targetDate
              ? formatDate(tomorrowPriority.targetDate, timezone)
              : undefined,
          }
        : null,
      settingsUrl: `${APP_URL}/settings`,
    })
  );

  try {
    const result = await getResend().emails.send({
      from: FROM_EMAIL,
      to: user.email,
      subject: `Your evening wrap-up — ${formatShortDate(now, timezone)}`,
      html,
    });

    console.log(`[Email] Evening digest for ${userId}: from=${FROM_EMAIL} to=${user.email}`, JSON.stringify(result));

    if (result.error) {
      console.error(`[Email] Resend rejected evening digest:`, result.error);
      return false;
    }

    await createNotification(userId, "email", {
      type: "evening_digest",
      dedupKey: `evening-digest-${todayInTimezone(timezone)}`,
    });

    return true;
  } catch (err) {
    console.error(`[Email] Evening digest failed for ${userId}:`, err);
    return false;
  }
}

// --- Helpers ---


function formatTime(dateStr: Date | string, timezone: string): string {
  const d = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
  return d.toLocaleString("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDate(dateStr: Date | string, timezone: string): string {
  const d = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
  return d.toLocaleString("en-US", {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatShortDate(date: Date, timezone: string): string {
  return date.toLocaleString("en-US", {
    timeZone: timezone,
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

import { todayInTimezone, localDaysRange } from "@/lib/timezone";
import { Resend } from "resend";
import { render } from "@react-email/components";
import { callSonnet } from "@/lib/ai";
import {
  buildMorningDigestPrompt,
  buildEveningDigestPrompt,
  formatCurrentDateTime,
} from "@/lib/ai/prompts";
import { enforceWordLimit, trimIncompleteTail } from "@/lib/ai/validate";
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
  getScheduledSessionsInRange,
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
 * Generate a digest's AI note, or null when there isn't a usable one.
 *
 * The digest must still send without it, so every failure path here returns
 * null rather than throwing — but none of them return silently. Callers render
 * a static fallback in place of a null note; they must never render an empty
 * string, which draws the callout box with nothing in it.
 */
async function generateDigestNote(
  label: string,
  system: string,
  context: string
): Promise<string | null> {
  let result;
  try {
    result = await callSonnet({
      system,
      user: context,
      maxTokens: 512,
      label: `digest-${label}`,
    });
  } catch (err) {
    console.error(`[Email] ${label} AI note generation failed:`, err);
    return null;
  }

  if (result.stopReason === "max_tokens") {
    console.warn(
      `[Email] ${label} AI note hit max_tokens (${result.outputTokens} out) — repairing cut tail`
    );
  }

  // A max_tokens stop lands wherever the token boundary fell, including
  // mid-word. Repair before the word limit, which assumes whole words.
  const repaired = trimIncompleteTail(result.text);
  const note = enforceWordLimit(repaired, 80).trim();

  if (note.length === 0) {
    console.error(
      `[Email] ${label} AI note came back empty (stop_reason=${result.stopReason}, ${result.outputTokens} out tokens) — falling back to static copy`
    );
    return null;
  }

  return note;
}

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
  const { start: todayStart, end: todayEnd } = localDaysRange(now, timezone);
  const events = sortEventsForDisplay(
    await getCalendarEventsByDateRange(userId, todayStart, todayEnd)
  );

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
  const weekEnd = localDaysRange(now, timezone, 7).end;
  const withDeadlines = pending.filter(
    (t) => t.deadline && new Date(t.deadline) <= weekEnd
  );

  // Soft targets land in their own list, with their own wording.
  const targetsThisWeek = pending.filter(
    (t) => t.targetDate && new Date(t.targetDate) <= weekEnd
  );

  // Work they planned to start today. Their plan, not a due date.
  //
  // Read from SESSIONS so a task planned for two sittings today appears twice,
  // at both times. Filtering `pending` by scheduledFor only ever showed the
  // earliest, so the digest quietly under-reported the day.
  const plannedToday = await getScheduledSessionsInRange(
    userId,
    todayStart,
    todayEnd
  );

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
    `Today's events: ${events.map((e) => `${eventTimeLabel(e, timezone)} ${e.title}`).join(", ") || "None"}`,
    `Top tasks: ${topTasks.map((t) => `${t.title} (${t.priority})${t.locationTags?.length ? ` [${t.locationTags.join(", ")}]` : ""}`).join(", ") || "None"}`,
    `HARD deadlines this week (real external consequences): ${withDeadlines.map((t) => `${t.title} due ${formatDate(t.deadline!, timezone)}`).join(", ") || "None"}`,
    `SOFT self-imposed targets this week (NOT due — never call these "due"): ${targetsThisWeek.map((t) => `${t.title}, they aimed for ${formatDate(t.targetDate!, timezone)}`).join(", ") || "None"}`,
    `Planned to start today (their own plan, not a deadline): ${plannedToday.map((t) => `${formatTime(t.scheduledFor, timezone)} ${t.title}`).join(", ") || "None"}`,
    activeCrises.length > 0
      ? `Active crises: ${activeCrises.map((c) => `"${c.taskName}" (${c.panicLevel})`).join(", ")}`
      : null,
    behaviorSignal,
  ]
    .filter(Boolean)
    .join("\n");

  const aiNote = await generateDigestNote(
    "Morning digest",
    buildMorningDigestPrompt(settings?.personalityPrefs as PersonalityPrefs | null ?? null),
    context
  );

  const html = await render(
    MorningDigestEmail({
      userName: user.displayName ?? "",
      aiNote,
      todayEvents: events.map((e) => ({
        title: e.title,
        time: eventTimeLabel(e, timezone),
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
  const { start: tomorrowStart, end: tomorrowEnd } = localDaysRange(now, timezone, 1, 1);

  // Work already planned for tomorrow — their plan, not a due date.
  // Session-based, same as the morning digest's plannedToday.
  const plannedTomorrow = await getScheduledSessionsInRange(
    userId,
    tomorrowStart,
    tomorrowEnd
  );
  const tomorrowEvents = sortEventsForDisplay(
    await getCalendarEventsByDateRange(userId, tomorrowStart, tomorrowEnd)
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
    `Tomorrow's calendar: ${tomorrowEvents.length > 0 ? tomorrowEvents.map((e) => `${eventTimeLabel(e, timezone)} ${e.title}`).join(", ") : "Nothing scheduled"}`,
    `Already planned for tomorrow (their own plan, not deadlines): ${plannedTomorrow.map((t) => `${formatTime(t.scheduledFor, timezone)} ${t.title}`).join(", ") || "Nothing planned yet"}`,
    activeCrises.length > 0
      ? `Active crises: ${activeCrises.map((c) => `"${c.taskName}" (${c.panicLevel})`).join(", ")}`
      : null,
    behaviorSignal,
  ]
    .filter(Boolean)
    .join("\n");

  const aiNote = await generateDigestNote(
    "Evening digest",
    buildEveningDigestPrompt(settings?.personalityPrefs as PersonalityPrefs | null ?? null),
    context
  );

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

/**
 * Order a day's events for display: all-day events first, then timed ones in
 * chronological order.
 *
 * An all-day event is stored at midnight but does not happen at midnight, so
 * sorting it by `startTime` alongside timed events puts it in a position it
 * hasn't earned and labels it "12:00 AM". Every other surface in the app
 * already groups them ahead of the timed list — agenda-view and week-view both
 * do — and the digests are the last place that didn't.
 */
function sortEventsForDisplay<T extends { startTime: Date; isAllDay: boolean | null }>(
  events: T[]
): T[] {
  return [...events].sort((a, b) => {
    if (a.isAllDay && !b.isAllDay) return -1;
    if (!a.isAllDay && b.isAllDay) return 1;
    return a.startTime.getTime() - b.startTime.getTime();
  });
}

/** "All day" for an all-day event, otherwise its local start time. */
function eventTimeLabel(
  event: { startTime: Date; isAllDay: boolean | null },
  timezone: string
): string {
  return event.isAllDay ? "All day" : formatTime(event.startTime, timezone);
}


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

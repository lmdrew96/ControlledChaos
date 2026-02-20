import { Resend } from "resend";
import { render } from "@react-email/components";
import { callHaiku } from "@/lib/ai";
import {
  MORNING_DIGEST_PROMPT,
  EVENING_DIGEST_PROMPT,
  formatCurrentDateTime,
} from "@/lib/ai/prompts";
import { enforceWordLimit } from "@/lib/ai/validate";
import {
  getUser,
  getUserSettings,
  getPendingTasks,
  getTasksCompletedToday,
  getCalendarEventsByDateRange,
  createNotification,
} from "@/lib/db/queries";
import { MorningDigestEmail } from "./emails/morning-digest";
import { EveningDigestEmail } from "./emails/evening-digest";
import type { EnergyProfile } from "@/types";

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY not configured");
  return new Resend(key);
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://controlledchaos.adhdesigns.dev";
const FROM_EMAIL = process.env.EMAIL_FROM ?? "ControlledChaos <noreply@adhdesigns.dev>";

/**
 * Send the morning digest email for a user.
 */
export async function sendMorningDigest(userId: string): Promise<boolean> {
  const [user, settings] = await Promise.all([
    getUser(userId),
    getUserSettings(userId),
  ]);
  if (!user?.email) return false;

  const timezone = user.timezone ?? "America/New_York";
  const now = new Date();

  // Today's events
  const todayStart = startOfDayInTz(now, timezone);
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const events = await getCalendarEventsByDateRange(userId, todayStart, todayEnd);

  // Pending tasks (sorted by priority)
  const pending = await getPendingTasks(userId);
  const priorityOrder = { urgent: 0, important: 1, normal: 2, someday: 3 };
  const sorted = [...pending].sort(
    (a, b) =>
      (priorityOrder[a.priority as keyof typeof priorityOrder] ?? 3) -
      (priorityOrder[b.priority as keyof typeof priorityOrder] ?? 3)
  );
  const topTasks = sorted.slice(0, 5);

  // Deadlines this week
  const weekEnd = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  const withDeadlines = pending.filter(
    (t) => t.deadline && new Date(t.deadline) <= weekEnd
  );

  // Energy profile for context
  const energyProfile = settings?.energyProfile as EnergyProfile | null;

  // Generate AI note
  const context = [
    `Current date/time: ${formatCurrentDateTime(timezone)}`,
    `User's name: ${user.displayName ?? "there"}`,
    energyProfile
      ? `Energy profile: Morning=${energyProfile.morning}, Afternoon=${energyProfile.afternoon}, Evening=${energyProfile.evening}`
      : null,
    `Today's events: ${events.map((e) => `${formatTime(e.startTime, timezone)} ${e.title}`).join(", ") || "None"}`,
    `Top tasks: ${topTasks.map((t) => `${t.title} (${t.priority})`).join(", ") || "None"}`,
    `Deadlines this week: ${withDeadlines.map((t) => `${t.title} due ${formatDate(t.deadline!, timezone)}`).join(", ") || "None"}`,
  ]
    .filter(Boolean)
    .join("\n");

  const aiResult = await callHaiku({
    system: MORNING_DIGEST_PROMPT,
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
      })),
      deadlinesThisWeek: withDeadlines.map((t) => ({
        title: t.title,
        deadline: formatDate(t.deadline!, timezone),
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
      dedupKey: `morning-digest-${now.toISOString().slice(0, 10)}`,
    });

    return true;
  } catch (err) {
    console.error(`[Email] Morning digest failed for ${userId}:`, err);
    return false;
  }
}

/**
 * Send the evening digest email for a user.
 */
export async function sendEveningDigest(userId: string): Promise<boolean> {
  const user = await getUser(userId);
  if (!user?.email) return false;

  const timezone = user.timezone ?? "America/New_York";
  const now = new Date();

  // Tasks completed today
  const completed = await getTasksCompletedToday(userId, timezone);

  // Pending tasks for tomorrow's priority
  const pending = await getPendingTasks(userId);
  const priorityOrder = { urgent: 0, important: 1, normal: 2, someday: 3 };
  const sorted = [...pending].sort(
    (a, b) =>
      (priorityOrder[a.priority as keyof typeof priorityOrder] ?? 3) -
      (priorityOrder[b.priority as keyof typeof priorityOrder] ?? 3)
  );
  const tomorrowPriority = sorted[0] ?? null;

  // Tomorrow's calendar for context
  const todayStart = startOfDayInTz(now, timezone);
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowEnd = new Date(tomorrowStart.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowEvents = await getCalendarEventsByDateRange(
    userId,
    tomorrowStart,
    tomorrowEnd
  );

  // Generate AI note
  const context = [
    `Current date/time: ${formatCurrentDateTime(timezone)}`,
    `User's name: ${user.displayName ?? "there"}`,
    `Tasks completed today: ${completed.map((t) => t.title).join(", ") || "None"}`,
    `Tomorrow's top priority: ${tomorrowPriority ? `${tomorrowPriority.title} (${tomorrowPriority.priority})` : "Nothing urgent"}`,
    `Tomorrow's calendar: ${tomorrowEvents.length > 0 ? tomorrowEvents.map((e) => `${formatTime(e.startTime, timezone)} ${e.title}`).join(", ") : "Nothing scheduled"}`,
  ].join("\n");

  const aiResult = await callHaiku({
    system: EVENING_DIGEST_PROMPT,
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
      dedupKey: `evening-digest-${now.toISOString().slice(0, 10)}`,
    });

    return true;
  } catch (err) {
    console.error(`[Email] Evening digest failed for ${userId}:`, err);
    return false;
  }
}

// --- Helpers ---

function startOfDayInTz(date: Date, timezone: string): Date {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((p) => p.type === "year")!.value;
  const month = parts.find((p) => p.type === "month")!.value;
  const day = parts.find((p) => p.type === "day")!.value;
  return new Date(`${year}-${month}-${day}T00:00:00`);
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

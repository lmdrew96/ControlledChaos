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
  getCalendarEventsByDateRange,
  getActiveCrisisPlans,
  getRecentTaskActivity,
  createNotification,
  getScheduledSessionsInRange,
  getUserGoals,
  getRecapDay,
  getDigestDraft,
  updateNotificationContent,
} from "@/lib/db/queries";
import { toTaskFacts, describeTaskFacts } from "@/lib/ai/context";
import { summarizeDayLoad, dayLoadSubtitle, type DayLoad } from "@/lib/recap/day-load";
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
      // Sonnet 5.5 thinks before writing, and thinking counts toward this cap.
      // A 50-70 word note runs ~700-850 tokens all in; at 512 the thinking ate
      // the whole budget and the note came back empty. The prompt's word
      // limit, not this cap, is what keeps the note short.
      maxTokens: 4096,
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
 * A digest's once-a-day draft: the generated note, stored before the send.
 *
 * The cron polls every ~15 min and only records "sent" after Resend accepts
 * the email, so when sends failed (10/24: domain unverified) every poll paid
 * for a fresh Sonnet note. Now the note is generated once per user per digest
 * per local day and reused; only the send is retried, up to
 * MAX_DIGEST_SEND_ATTEMPTS times.
 */
const DIGEST_DRAFT_TYPE = "digest_draft";
const MAX_DIGEST_SEND_ATTEMPTS = 3;
/** A draft still ungenerated after this long was left by a run that died mid-call. */
const DRAFT_GENERATION_GRACE_MS = 10 * 60 * 1000;

interface DigestDraftContent {
  draftKey: string;
  aiNote: string | null;
  generated: boolean;
  attempts: number;
}

interface DigestDraft {
  id: string;
  content: DigestDraftContent;
  isNew: boolean;
}

/**
 * Today's draft for this digest, creating it if there isn't one yet. Null
 * means skip this poll: the digest was abandoned, or another poll is
 * generating its note right now.
 */
async function openDigestDraft(
  userId: string,
  draftKey: string
): Promise<DigestDraft | null> {
  const existing = await getDigestDraft(userId, draftKey);
  if (!existing) {
    const content: DigestDraftContent = { draftKey, aiNote: null, generated: false, attempts: 0 };
    const row = await createNotification(userId, DIGEST_DRAFT_TYPE, { ...content });
    return { id: row.id, content, isNew: true };
  }

  const content = existing.content as DigestDraftContent;
  if (content.attempts >= MAX_DIGEST_SEND_ATTEMPTS) return null;
  if (!content.generated && Date.now() - existing.createdAt.getTime() < DRAFT_GENERATION_GRACE_MS) {
    return null;
  }
  // An old ungenerated draft sends with the static fallback rather than
  // paying for a second note.
  return { id: existing.id, content, isNew: false };
}

/** The note for this send: generated on a new draft, reused on a retry. */
async function draftNote(
  userId: string,
  draft: DigestDraft | null,
  generate: () => Promise<string | null>
): Promise<string | null> {
  if (draft && !draft.isNew) return draft.content.aiNote;

  const aiNote = await generate();
  if (draft) {
    draft.content = { ...draft.content, aiNote, generated: true };
    await updateNotificationContent(draft.id, userId, { ...draft.content });
  }
  return aiNote;
}

/** Count a failed send; warn once, on the attempt that abandons the digest. */
async function recordDigestSendFailure(
  userId: string,
  draft: DigestDraft | null,
  label: string
): Promise<void> {
  if (!draft) return;
  const attempts = draft.content.attempts + 1;
  draft.content = { ...draft.content, attempts };
  try {
    await updateNotificationContent(draft.id, userId, { ...draft.content });
  } catch (err) {
    console.error(`[Email] Couldn't record failed ${label} send for ${userId}:`, err);
  }
  if (attempts >= MAX_DIGEST_SEND_ATTEMPTS) {
    console.warn(
      `[Email] ${label} abandoned for ${userId} after ${attempts} failed sends — no more retries today`
    );
  }
}

/**
 * Send the morning digest email for a user.
 */
export async function sendMorningDigest(
  userId: string,
  { force = false }: { force?: boolean } = {}
): Promise<boolean> {
  const [user, settings] = await Promise.all([
    getUser(userId),
    getUserSettings(userId),
  ]);
  if (!user?.email) return false;

  const timezone = user.timezone ?? "America/New_York";
  const now = new Date();

  // A forced (manual) run always generates fresh and leaves the draft alone.
  const draft = force
    ? null
    : await openDigestDraft(userId, `morning-digest-${todayInTimezone(timezone)}`);
  if (!force && !draft) return false;

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
  // Past-due ones get their own list: a deadline that already went by isn't
  // "this week", and filing it there misreads as still ahead.
  const withDeadlines = pending.filter(
    (t) => t.deadline && new Date(t.deadline) >= now && new Date(t.deadline) <= weekEnd
  );
  const pastDue = pending.filter((t) => t.deadline && new Date(t.deadline) < now);

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
  const [activeCrises, recentActivity, activeGoals] = await Promise.all([
    getActiveCrisisPlans(userId),
    getRecentTaskActivity(userId, 10),
    getUserGoals(userId, "active"),
  ]);
  // Task facts use the same wording as every in-app prompt (buildAIContext).
  const goalTitleById = new Map(activeGoals.map((g) => [g.id, g.title]));

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
    `Today's events: ${events.map((e) => `${eventTimeLabel(e, timezone)} ${e.title}`).join(", ") || "None"}`,
    `Top tasks: ${topTasks.map((t) => `${describeTaskFacts(toTaskFacts(t, goalTitleById), timezone)}`).join("; ") || "None"}`,
    `HARD deadlines this week (real external consequences): ${withDeadlines.map((t) => `${t.title} due ${formatDate(t.deadline!, timezone)}`).join(", ") || "None"}`,
    pastDue.length > 0
      ? `Past due, still open (the date has passed — don't call these "this week"): ${pastDue.map((t) => `${t.title}, was due ${formatDate(t.deadline!, timezone)}`).join(", ")}`
      : null,
    `SOFT self-imposed targets this week (NOT due — never call these "due"): ${targetsThisWeek.map((t) => `${t.title}, they aimed for ${formatDate(t.targetDate!, timezone)}`).join(", ") || "None"}`,
    `Planned to start today (their own plan, not a deadline): ${plannedToday.map((t) => `${formatTime(t.scheduledFor, timezone)} ${t.title}`).join(", ") || "None"}`,
    activeCrises.length > 0
      ? `Active crises: ${activeCrises.map((c) => `"${c.taskName}" (${c.panicLevel})`).join(", ")}`
      : null,
    behaviorSignal,
  ]
    .filter(Boolean)
    .join("\n");

  const aiNote = await draftNote(userId, draft, () =>
    generateDigestNote(
      "Morning digest",
      buildMorningDigestPrompt(settings?.personalityPrefs as PersonalityPrefs | null ?? null),
      context
    )
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
      pastDue: pastDue.map((t) => ({
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
      await recordDigestSendFailure(userId, draft, "Morning digest");
      return false;
    }

    await createNotification(userId, "email", {
      type: "morning_digest",
      dedupKey: `morning-digest-${todayInTimezone(timezone)}`,
    });

    return true;
  } catch (err) {
    console.error(`[Email] Morning digest failed for ${userId}:`, err);
    await recordDigestSendFailure(userId, draft, "Morning digest");
    return false;
  }
}

/**
 * Send the evening digest email for a user.
 */
export async function sendEveningDigest(
  userId: string,
  { force = false }: { force?: boolean } = {}
): Promise<boolean> {
  const [user, settings] = await Promise.all([
    getUser(userId),
    getUserSettings(userId),
  ]);
  if (!user?.email) return false;

  const timezone = user.timezone ?? "America/New_York";
  const now = new Date();

  // A forced (manual) run always generates fresh and leaves the draft alone.
  const draft = force
    ? null
    : await openDigestDraft(userId, `evening-digest-${todayInTimezone(timezone)}`);
  if (!force && !draft) return false;

  // What today held, read off the Mirror timeline — the calendar first, then
  // anything checked off or logged. Tasks alone called an exam day "quiet".
  const { start: todayStart, end: todayEnd } = localDaysRange(now, timezone);
  const dayLoad = summarizeDayLoad(await getRecapDay(userId, todayStart, todayEnd));

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

  // The soonest task can be due tonight, or already past due. Calling that
  // "tomorrow's top priority" misplaces it, so the heading follows the date.
  const priorityDeadline = tomorrowPriority?.deadline ? new Date(tomorrowPriority.deadline) : null;
  const priorityLabel =
    priorityDeadline && priorityDeadline < now
      ? "Past Due, Still Open"
      : priorityDeadline && priorityDeadline < tomorrowStart
        ? "Still Due Tonight"
        : "Tomorrow's Top Priority";

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
  const [activeCrises, recentActivity, activeGoals] = await Promise.all([
    getActiveCrisisPlans(userId),
    getRecentTaskActivity(userId, 10),
    getUserGoals(userId, "active"),
  ]);
  const goalTitleById = new Map(activeGoals.map((g) => [g.id, g.title]));

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
    ...describeDayLoad(dayLoad, timezone),
    `${priorityLabel}: ${
      tomorrowPriority
        ? describeTaskFacts(toTaskFacts(tomorrowPriority, goalTitleById), timezone)
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

  const aiNote = await draftNote(userId, draft, () =>
    generateDigestNote(
      "Evening digest",
      buildEveningDigestPrompt(settings?.personalityPrefs as PersonalityPrefs | null ?? null),
      context
    )
  );

  const html = await render(
    EveningDigestEmail({
      userName: user.displayName ?? "",
      aiNote,
      completedTasks: dayLoad.tasksDone.map((title) => ({ title })),
      sittingsWorked: dayLoad.sittingsWorked.map((s) => ({
        title: s.title,
        // Same words as the Mirror's sitting rows.
        detail: `${s.status === "done" ? "Done" : "Partly"}${s.minutes ? ` · ${s.minutes} min` : ""}`,
      })),
      daySubtitle: dayLoadSubtitle(dayLoad),
      priorityLabel,
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
      await recordDigestSendFailure(userId, draft, "Evening digest");
      return false;
    }

    await createNotification(userId, "email", {
      type: "evening_digest",
      dedupKey: `evening-digest-${todayInTimezone(timezone)}`,
    });

    return true;
  } catch (err) {
    console.error(`[Email] Evening digest failed for ${userId}:`, err);
    await recordDigestSendFailure(userId, draft, "Evening digest");
    return false;
  }
}

// --- Helpers ---

/**
 * Today's Mirror as context lines for the evening note. Events are what the
 * calendar HAD — CC can't know attendance — and exams are flagged so the note
 * names them.
 */
function describeDayLoad(load: DayLoad, timezone: string): string[] {
  const lines: string[] = [];

  if (load.events.length > 0) {
    const hours = Math.round((load.scheduledMinutes / 60) * 2) / 2;
    const items = load.events.map((e) => {
      const tags = [
        e.isNotable ? "exam/assessment" : null,
        e.isTentative ? "tentative — they might have gone" : null,
      ].filter(Boolean);
      return `${eventTimeLabel(e, timezone)} ${e.title}${tags.length ? ` (${tags.join(", ")})` : ""}`;
    });
    lines.push(
      `Today's calendar had ${load.events.length} event${load.events.length === 1 ? "" : "s"}` +
        (hours > 0 ? `, about ${hours} hour${hours === 1 ? "" : "s"} scheduled` : "") +
        `: ${items.join("; ")}`
    );
    const notable = load.events.filter((e) => e.isNotable).map((e) => e.title);
    if (notable.length > 0) lines.push(`Notable today (name these): ${notable.join(", ")}`);
  } else {
    lines.push("Today's calendar: nothing scheduled");
  }

  lines.push(`Tasks completed today: ${load.tasksDone.join(", ") || "None"}`);
  if (load.sittingsWorked.length > 0) {
    lines.push(
      `Planned sittings they worked today (real progress on a task): ${load.sittingsWorked
        .map((s) => `${s.title} (${s.status === "done" ? "done" : "partly"}${s.minutes ? `, ${s.minutes} min` : ""})`)
        .join(", ")}`
    );
  }

  const logged = [
    load.microtasksDone && `${load.microtasksDone} microtask${load.microtasksDone === 1 ? "" : "s"} done`,
    load.moments && `${load.moments} moment${load.moments === 1 ? "" : "s"} logged`,
    load.journals && `${load.journals} journal entr${load.journals === 1 ? "y" : "ies"}`,
    load.dumps && `${load.dumps} brain dump${load.dumps === 1 ? "" : "s"}`,
    load.rescues && `${load.rescues} rescue plan${load.rescues === 1 ? "" : "s"} wrapped up`,
  ].filter(Boolean);
  if (logged.length > 0) lines.push(`Also logged today: ${logged.join(", ")}`);

  lines.push(
    load.isEmpty
      ? "Day shape: genuinely empty — nothing on the calendar, nothing done or logged"
      : "Day shape: NOT a quiet day — do not call it quiet"
  );
  return lines;
}

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

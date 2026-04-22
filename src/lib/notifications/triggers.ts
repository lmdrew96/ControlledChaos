import {
  getLastTaskCompletion,
  getPendingTasks,
  getRecentNotifications,
  getRecentTaskActivity,
  getCalendarEventsByDateRange,
  getUserLocation,
  getSavedLocations,
  getCommuteTimes,
  getActiveMedications,
} from "@/lib/db/queries";
import { startOfDayInTimezone, getHourInTimezone } from "@/lib/timezone";
import { callSonnet } from "@/lib/ai";
import { buildInactivityNudgePrompt, buildPushNotificationPrompt } from "@/lib/ai/prompts";
import { enforceWordLimit } from "@/lib/ai/validate";
import {
  DEFAULT_REMINDER_INTERVALS,
  type DailyCheckInTime,
  type NotificationAssertiveness,
  type NotificationPrefs,
  type PersonalityPrefs,
} from "@/types";

interface DeadlineReminder {
  taskId: string;
  taskTitle: string;
  intervalMinutes: number;
  deadline: Date;
}

export interface EventReminder {
  eventId: string;
  eventTitle: string;
  intervalMinutes: number;
  startTime: Date;
}

/**
 * Normalize a user's reminder intervals. Defaults to [1440, 60, 10] (1 day, 1 hour, 10 min).
 * Returned intervals are unique positive minutes, sorted descending.
 */
export function getReminderIntervals(prefs: NotificationPrefs | null | undefined): number[] {
  const raw = prefs?.reminderIntervals;
  // null/undefined = use defaults. Empty array = user explicitly opted out.
  const source = Array.isArray(raw) ? raw : DEFAULT_REMINDER_INTERVALS;
  const cleaned = Array.from(
    new Set(
      source
        .filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n > 0)
        .map((n) => Math.floor(n))
    )
  );
  return cleaned.sort((a, b) => b - a);
}

/**
 * Return the interval (minutes) whose window currently covers `diffMs`, or null if none.
 * Interval I fires when `next_smaller < diffMs <= I`. Intervals must be sorted descending.
 */
function pickIntervalForDiff(diffMs: number, intervalsDesc: number[]): number | null {
  if (diffMs <= 0) return null;
  for (let i = 0; i < intervalsDesc.length; i++) {
    const upperMs = intervalsDesc[i] * 60 * 1000;
    const lowerMs = (intervalsDesc[i + 1] ?? 0) * 60 * 1000;
    if (diffMs > lowerMs && diffMs <= upperMs) return intervalsDesc[i];
  }
  return null;
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

/**
 * Resolve the effective daily check-in config for a user. At most one idle check-in
 * per day (collapsed from the old morning/afternoon/evening triple, which could
 * fire up to 3 times in a single day).
 *
 * Defaults when prefs are unset:
 *   - enabled: true (preserves pre-existing morning check-in behavior for all modes)
 *   - window:  "morning" (matches the default window of the old triple)
 * Users can disable entirely or switch to afternoon/evening via settings.
 * Assertiveness mode affects message tone and the daily cap, not whether this fires.
 */
export function resolveDailyCheckInConfig(
  prefs: NotificationPrefs | null | undefined
): { enabled: boolean; window: DailyCheckInTime } {
  const enabled =
    typeof prefs?.dailyCheckInEnabled === "boolean" ? prefs.dailyCheckInEnabled : true;
  const window: DailyCheckInTime =
    prefs?.dailyCheckInTime === "morning" ||
    prefs?.dailyCheckInTime === "afternoon" ||
    prefs?.dailyCheckInTime === "evening"
      ? prefs.dailyCheckInTime
      : "morning";
  return { enabled, window };
}

export function getDailyPushCap(mode: NotificationAssertiveness): number {
  return NOTIFICATION_CAPS[mode];
}

export async function getPushNotificationsSentToday(userId: string, timezone = "America/New_York"): Promise<number> {
  const recent = await getRecentNotifications(userId, 100);
  const todayStart = startOfDayInTimezone(new Date(), timezone);

  return recent.filter((n) => n.type === "push" && n.sentAt && new Date(n.sentAt) >= todayStart).length;
}

/**
 * Check for tasks with upcoming deadlines that need push reminders.
 * For each pending task with a deadline, picks the configured interval whose
 * window currently covers the time remaining (e.g. [1440, 60, 10] fires once
 * at each crossing). Dedup is handled at the cron layer.
 */
export async function getDeadlineReminders(
  userId: string,
  prefs: NotificationPrefs | null | undefined
): Promise<DeadlineReminder[]> {
  const intervals = getReminderIntervals(prefs);
  if (intervals.length === 0) return [];

  const tasks = await getPendingTasks(userId);
  const now = Date.now();
  const reminders: DeadlineReminder[] = [];

  for (const task of tasks) {
    if (!task.deadline) continue;
    const deadlineMs = new Date(task.deadline).getTime();
    const diff = deadlineMs - now;
    const interval = pickIntervalForDiff(diff, intervals);
    if (interval === null) continue;

    reminders.push({
      taskId: task.id,
      taskTitle: task.title,
      intervalMinutes: interval,
      deadline: task.deadline,
    });
  }

  reminders.sort((a, b) => a.deadline.getTime() - b.deadline.getTime());
  return reminders;
}

/**
 * Check for upcoming calendar events that need push reminders.
 *
 * Skipped:
 * - All-day events (start time is midnight in user's timezone — reminders fire at odd hours).
 * - Events whose location matches a saved location (handled by getDepartureAlerts instead,
 *   to avoid double-firing time-to-leave + reminder within the same window).
 */
export async function getEventReminders(
  userId: string,
  prefs: NotificationPrefs | null | undefined
): Promise<EventReminder[]> {
  const intervals = getReminderIntervals(prefs);
  if (intervals.length === 0) return [];

  const now = new Date();
  const maxLookAheadMs = intervals[0] * 60 * 1000;
  const lookAheadEnd = new Date(now.getTime() + maxLookAheadMs);

  const [events, savedLocs] = await Promise.all([
    getCalendarEventsByDateRange(userId, now, lookAheadEnd),
    getSavedLocations(userId),
  ]);

  const nowMs = now.getTime();
  const reminders: EventReminder[] = [];

  for (const event of events) {
    if (event.isAllDay) continue;
    if (matchEventLocationToSavedLocation(event.location, savedLocs)) continue;

    const startMs = new Date(event.startTime).getTime();
    const diff = startMs - nowMs;
    const interval = pickIntervalForDiff(diff, intervals);
    if (interval === null) continue;

    reminders.push({
      eventId: event.id,
      eventTitle: event.title,
      intervalMinutes: interval,
      startTime: event.startTime,
    });
  }

  reminders.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  return reminders;
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
  const currentHour = getHourInTimezone(now, timezone);
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
  const todayStart = startOfDayInTimezone(new Date(), timezone);

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
  | { type: "deadline_reminder"; taskTitle: string; minutesUntil: number }
  | { type: "event_reminder"; eventTitle: string; minutesUntil: number }
  | { type: "scheduled"; taskTitle: string }
  | { type: "scheduled_missed"; taskTitle: string }
  | { type: "idle_checkin"; topTaskTitle?: string; activityLevel: "active" | "idle" }
  | { type: "idle_checkin_afternoon"; topTaskTitle?: string; activityLevel: "active" | "idle" }
  | { type: "idle_checkin_evening"; topTaskTitle?: string; activityLevel: "active" | "idle" }
  | { type: "location_arrival"; locationName: string; taskTitle: string; taskCount: number }
  | { type: "location_departure_nearby"; locationName: string; nearbyLocationName: string; taskTitle: string }
  | { type: "time_to_leave_soon"; eventTitle: string; minutesUntilLeave: number; destination: string; commuteMinutes: number }
  | { type: "time_to_leave_now"; eventTitle: string; destination: string; commuteMinutes: number }
  | { type: "crisis_detected"; taskNames: string[]; availableHours: number; requiredHours: number }
  | { type: "crisis_worsened"; taskNames: string[]; newRatio: number };

/**
 * Human-readable label for an interval (e.g. 1440 → "1 day", 90 → "90 minutes").
 */
export function formatReminderInterval(minutes: number): string {
  if (minutes % (60 * 24) === 0) {
    const days = minutes / (60 * 24);
    return days === 1 ? "1 day" : `${days} days`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? "1 hour" : `${hours} hours`;
  }
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}

const PUSH_FALLBACKS: Record<PushNotificationContext["type"], string> = {
  deadline_reminder: "Heads up — a deadline is coming up.",
  event_reminder: "Heads up — an event is coming up.",
  scheduled: "You planned this. Past-you had your back.",
  scheduled_missed: "That planned start time slipped. Pick it back up now or snooze with intent.",
  idle_checkin: "Got anything on your mind? Quick brain dump?",
  idle_checkin_afternoon: "Afternoon's ticking. One small thing is better than nothing.",
  idle_checkin_evening: "It's 7:00 and today's still open. Want to close one task before tonight?",
  location_arrival: "You're here — might as well knock this out.",
  location_departure_nearby: "Before you head home, there's something nearby.",
  time_to_leave_soon: "Time to start wrapping up — you need to head out soon.",
  time_to_leave_now: "Time to leave! You need to go now to make it.",
  crisis_detected: "Some of your deadlines are on a collision course. There's a plan in Crisis Mode if you want it.",
  crisis_worsened: "Things just got tighter. Your crisis plan is still waiting in Crisis Mode.",
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
  if (ctx.type === "deadline_reminder") {
    userMsg = `Type: deadline_reminder\nTask: "${ctx.taskTitle}"\nTime until deadline: ${formatReminderInterval(ctx.minutesUntil)} (${ctx.minutesUntil} min)`;
  } else if (ctx.type === "event_reminder") {
    userMsg = `Type: event_reminder\nEvent: "${ctx.eventTitle}"\nTime until event: ${formatReminderInterval(ctx.minutesUntil)} (${ctx.minutesUntil} min)`;
  } else if (ctx.type === "idle_checkin") {
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
  } else if (ctx.type === "time_to_leave_soon") {
    userMsg = `Type: time_to_leave_soon\nEvent: "${ctx.eventTitle}"\nDestination: "${ctx.destination}"\nMinutes until you need to leave: ${ctx.minutesUntilLeave}\nCommute time: ${ctx.commuteMinutes} min`;
  } else if (ctx.type === "time_to_leave_now") {
    userMsg = `Type: time_to_leave_now\nEvent: "${ctx.eventTitle}"\nDestination: "${ctx.destination}"\nCommute time: ${ctx.commuteMinutes} min`;
  } else if (ctx.type === "crisis_detected") {
    const names = ctx.taskNames.join(" and ");
    userMsg = `Type: crisis_detected\nConflicting tasks: ${names}\nAvailable work time: ${ctx.availableHours.toFixed(1)} hours\nRequired work time: ${ctx.requiredHours.toFixed(1)} hours`;
  } else if (ctx.type === "crisis_worsened") {
    const names = ctx.taskNames.join(" and ");
    userMsg = `Type: crisis_worsened\nConflicting tasks: ${names}\nNew crisis ratio: ${ctx.newRatio.toFixed(2)} (higher = worse)`;
  } else {
    userMsg = `Type: ${ctx.type}\nTask: "${"taskTitle" in ctx ? ctx.taskTitle : ""}"`;
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
    if (ctx.type === "deadline_reminder") {
      return `${ctx.taskTitle} is due in ${formatReminderInterval(ctx.minutesUntil)}.`;
    }
    if (ctx.type === "event_reminder") {
      return `${ctx.eventTitle} starts in ${formatReminderInterval(ctx.minutesUntil)}.`;
    }
    if (ctx.type === "scheduled" || ctx.type === "scheduled_missed") {
      const fallback = PUSH_FALLBACKS[ctx.type];
      return fallback.replace("You planned this", `Time for ${ctx.taskTitle}`);
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
  const currentHour = getHourInTimezone(now, timezone);
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
  const currentHour = getHourInTimezone(now, timezone);
  if (currentHour < 19) {
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
  userId: string,
  timezone = "America/New_York"
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
    streakKey = new Date(lastCompletion).toLocaleDateString("en-CA", { timeZone: timezone });
  }

  if (hoursInactive < 72) return null;

  const tier: NudgeTier = hoursInactive >= 120 ? 3 : hoursInactive >= 96 ? 2 : 1;

  return { tier, streakKey, hoursInactive };
}

// ============================================================
// Time to Leave — departure alerts for upcoming calendar events
// ============================================================

export interface DepartureAlert {
  eventId: string;
  eventTitle: string;
  eventStartTime: Date;
  destination: string; // matched saved location name
  commuteMinutes: number;
  leaveByTime: Date; // when user needs to leave
  minutesUntilLeave: number; // from now
  level: "soon" | "now"; // "soon" = 10-20 min out, "now" = 0-10 min out
}

const DEPARTURE_BUFFER_MINUTES = 5; // Extra buffer on top of commute time

/**
 * Match a calendar event's location string to a saved location by name.
 * Uses case-insensitive substring matching in both directions.
 */
export function matchEventLocationToSavedLocation(
  eventLocation: string | null,
  savedLocations: Array<{ id: string; name: string }>
): { id: string; name: string } | null {
  if (!eventLocation?.trim()) return null;

  const eventLoc = eventLocation.toLowerCase();

  for (const loc of savedLocations) {
    const savedName = loc.name.toLowerCase();
    // Match if either contains the other (e.g., "Smith Hall Room 101" matches "Campus")
    // or if event location starts with the saved name
    if (
      eventLoc.includes(savedName) ||
      savedName.includes(eventLoc) ||
      eventLoc.startsWith(savedName)
    ) {
      return loc;
    }
  }

  return null;
}

/**
 * Get departure alerts for a user's upcoming events.
 * Compares event locations to saved locations and calculates when
 * the user needs to leave based on commute times.
 */
export async function getDepartureAlerts(
  userId: string,
  timezone: string
): Promise<DepartureAlert[]> {
  const now = new Date();
  const lookAheadEnd = new Date(now.getTime() + 3 * 60 * 60 * 1000); // 3 hours ahead

  const [upcomingEvents, userLoc, savedLocs, allCommutes] = await Promise.all([
    getCalendarEventsByDateRange(userId, now, lookAheadEnd),
    getUserLocation(userId),
    getSavedLocations(userId),
    getCommuteTimes(userId),
  ]);

  // Need to know where the user currently is
  if (!userLoc?.matchedLocationId) return [];

  const alerts: DepartureAlert[] = [];

  for (const event of upcomingEvents) {
    if (event.isAllDay) continue;
    if (!event.location) continue;

    // Match event location to a saved location
    const destination = matchEventLocationToSavedLocation(event.location, savedLocs);
    if (!destination) continue;

    // Skip if already at the destination
    if (destination.id === userLoc.matchedLocationId) continue;

    // Find commute time from current location to event location
    // Check all travel modes and use the shortest (most likely mode)
    const relevantCommutes = allCommutes.filter(
      (c) =>
        c.fromLocationId === userLoc.matchedLocationId &&
        c.toLocationId === destination.id
    );

    if (relevantCommutes.length === 0) continue;

    // Use shortest commute time across all modes
    const shortestCommute = relevantCommutes.reduce((min, c) =>
      c.travelMinutes < min.travelMinutes ? c : min
    );
    const commuteMinutes = shortestCommute.travelMinutes;

    // Calculate when user needs to leave
    const eventStart = new Date(event.startTime);
    const leaveByTime = new Date(
      eventStart.getTime() - (commuteMinutes + DEPARTURE_BUFFER_MINUTES) * 60_000
    );
    const minutesUntilLeave = Math.round(
      (leaveByTime.getTime() - now.getTime()) / 60_000
    );

    // Skip if leave time already passed by more than 5 min
    if (minutesUntilLeave < -5) continue;

    // Determine alert level
    let level: "soon" | "now";
    if (minutesUntilLeave <= 0) {
      level = "now"; // Need to leave NOW
    } else if (minutesUntilLeave <= 20) {
      level = "soon"; // Need to leave in 10-20 min
    } else {
      continue; // Too far out, skip
    }

    alerts.push({
      eventId: event.id,
      eventTitle: event.title,
      eventStartTime: eventStart,
      destination: destination.name,
      commuteMinutes,
      leaveByTime,
      minutesUntilLeave: Math.max(0, minutesUntilLeave),
      level,
    });
  }

  // Sort by most urgent first
  alerts.sort((a, b) => a.minutesUntilLeave - b.minutesUntilLeave);

  return alerts;
}

// ============================================================
// Medication Reminders
// ============================================================

interface MedicationReminder {
  medicationId: string;
  medicationName: string;
  dosage: string;
  timeSlot: string; // "09:00"
}

/**
 * Check which medication reminders should fire in the current 15-minute cron window.
 * Returns medications+times that match the current window and schedule.
 */
export async function getMedicationRemindersForWindow(
  userId: string,
  timezone: string
): Promise<MedicationReminder[]> {
  const meds = await getActiveMedications(userId);
  if (meds.length === 0) return [];

  const now = new Date();
  const currentHour = getHourInTimezone(now, timezone);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const currentTime = formatter.format(now); // "HH:MM"
  const currentMinutes = parseInt(currentTime.split(":")[0]) * 60 + parseInt(currentTime.split(":")[1]);

  // Get current day info in user's timezone
  const dayFormatter = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" });
  const dayOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    .indexOf(dayFormatter.format(now).slice(0, 3));

  const dateFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: timezone });
  const todayStr = dateFormatter.format(now); // "2026-04-14"

  const reminders: MedicationReminder[] = [];

  for (const med of meds) {
    const schedule = med.schedule as { type: string; everyDays?: number; startDate?: string; daysOfWeek?: number[] };
    const reminderTimes = med.reminderTimes as string[];

    // Check if today matches the schedule
    if (schedule.type === "weekly") {
      if (!schedule.daysOfWeek?.includes(dayOfWeek)) continue;
    } else if (schedule.type === "interval" && schedule.everyDays && schedule.startDate) {
      const startMs = new Date(schedule.startDate).getTime();
      const todayMs = new Date(todayStr).getTime();
      const daysSince = Math.floor((todayMs - startMs) / (24 * 60 * 60 * 1000));
      if (daysSince < 0 || daysSince % schedule.everyDays !== 0) continue;
    }
    // type === "daily" always matches

    // Check each reminder time — is it within the current 15-min cron window?
    for (const time of reminderTimes) {
      const [h, m] = time.split(":").map(Number);
      const slotMinutes = h * 60 + m;

      // Fire if we're within [slotMinutes, slotMinutes+14]
      if (currentMinutes >= slotMinutes && currentMinutes < slotMinutes + 15) {
        reminders.push({
          medicationId: med.id,
          medicationName: med.name,
          dosage: med.dosage,
          timeSlot: time,
        });
      }
    }
  }

  return reminders;
}

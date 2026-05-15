import { NextResponse } from "next/server";
import {
  getAllUsersWithPushEnabled,
  getPendingSnoozedPushes,
  markSnoozedPushSent,
  getUserLocation,
} from "@/lib/db/queries";
import { sendPushToUser, isQuietHours } from "@/lib/notifications/send-push";
import { todayInTimezone } from "@/lib/timezone";
import {
  getDeadlineReminders,
  getEventReminders,
  getDailyPushCap,
  getAssertivenessMode,
  getScheduledTaskAlerts,
  getMissedScheduledTaskAlerts,
  getDepartureAlerts,
  getPushNotificationsSentToday,
  shouldSendIdleCheckin,
  shouldSendAfternoonCheckin,
  getEveningCheckinStatus,
  resolveDailyCheckInConfig,
  hasBeenNotifiedToday,
  hasEverBeenNotified,
  getInactivityNudgeTier,
  generateNudgeMessage,
  generatePushMessage,
  getTopPendingTaskTitle,
  getMedicationRemindersForWindow,
} from "@/lib/notifications/triggers";
import { buildUserSnapshot } from "@/lib/context/user-snapshot";
import { runCrisisDetection } from "@/lib/crisis-detection/cron-handler";

// Vercel Pro: 60s max. Default (10s) silently truncates the per-user loop
// once the user count grows past ~5–10 push-enabled users.
export const maxDuration = 60;

// Per-chunk concurrency for the per-user loop. AI message generation is the
// dominant cost per user; ~10 in-flight is well below typical Anthropic API
// rate limits while keeping total wall-clock under maxDuration.
const USER_CONCURRENCY = 10;

const TASK_ACTIONS = [
  { action: "start_task", title: "▶ Start" },
  { action: "snooze", title: "⏰ Snooze 30 min" },
];

const IDLE_ACTIONS = [
  { action: "brain_dump", title: "✏ Brain Dump" },
  { action: "see_tasks", title: "📋 See Tasks" },
];

const MISSED_TASK_ACTIONS = [
  { action: "start_task", title: "▶ Start now" },
  { action: "snooze", title: "⏰ Snooze 30 min" },
];

const MED_ACTIONS = [
  { action: "med_taken", title: "✓ Taken" },
  { action: "snooze", title: "⏰ Snooze 30 min" },
];

const BUNDLED_MED_ACTIONS = [
  { action: "med_taken", title: "✓ All Taken" },
  { action: "snooze", title: "⏰ Snooze 30 min" },
];

function formatMedBundleBody(
  meds: { medicationName: string; dosage: string }[]
): string {
  const items = meds.map((m) => `${m.medicationName} (${m.dosage})`);
  if (items.length === 2) return `Time for ${items[0]} and ${items[1]}`;
  const allButLast = items.slice(0, -1).join(", ");
  return `Time for ${allButLast}, and ${items[items.length - 1]}`;
}

const EVENT_ACTIONS = [
  { action: "see_calendar", title: "📅 View" },
];

type PushUser = Awaited<ReturnType<typeof getAllUsersWithPushEnabled>>[number];

/**
 * Per-user trigger evaluation. Returns the number of pushes sent for this user
 * so the outer loop can aggregate without shared mutable state.
 */
async function processUser(user: PushUser): Promise<number> {
  const { userId, timezone, personalityPrefs, notificationPrefs, crisisDetectionTier } = user;
  const mode = getAssertivenessMode(notificationPrefs);
  const dailyCap = getDailyPushCap(mode);
  let sentToday = await getPushNotificationsSentToday(userId, timezone);
  let userSent = 0;

  // Compute quiet hours once — gates AI generation so we don't pay for messages
  // that sendPushToUser would silently suppress anyway.
  const quietHoursActive = notificationPrefs ? isQuietHours(notificationPrefs, timezone) : false;

  // Lazy location fetch — only hits DB on first call, cached for this user
  let _locationName: string | undefined;
  let _locationFetched = false;
  const getLocationName = async () => {
    if (!_locationFetched) {
      const userLoc = await getUserLocation(userId);
      _locationName = userLoc?.matchedLocationName ?? undefined;
      _locationFetched = true;
    }
    return _locationName;
  };

  // Build user context snapshot once per user — shared across all notification types
  let _snapshot: string | undefined;
  let _snapshotFetched = false;
  const getSnapshot = async () => {
    if (!_snapshotFetched) {
      try {
        const snapshot = await buildUserSnapshot(userId);
        _snapshot = snapshot.formatted;
      } catch (err) {
        console.error(`[Push] snapshot failed for user=${userId}:`, err);
      }
      _snapshotFetched = true;
    }
    return _snapshot;
  };

  const canSend = (priority: "high" | "normal", bypassesQuietHours = false) => {
    if (quietHoursActive && !bypassesQuietHours) return false;
    return priority === "high" || sentToday < dailyCap;
  };

  const markSent = () => {
    sentToday += 1;
    userSent += 1;
  };

  // --- Deadline Reminders ---
  const deadlineReminders = await getDeadlineReminders(userId, notificationPrefs);
  for (const reminder of deadlineReminders) {
    const priority = reminder.intervalMinutes <= 60 ? "high" : "normal";
    const bypassQH = reminder.intervalMinutes <= 30;
    if (!canSend(priority, bypassQH)) continue;

    const dedupKey = `deadline-${reminder.taskId}-${reminder.intervalMinutes}-${reminder.deadline.toISOString()}`;
    if (await hasEverBeenNotified(userId, dedupKey)) continue;

    const message = await generatePushMessage(
      { type: "deadline_reminder", taskTitle: reminder.taskTitle, minutesUntil: reminder.intervalMinutes },
      personalityPrefs,
      timezone,
      mode,
      await getLocationName(),
      await getSnapshot()
    );
    const sent = await sendPushToUser(userId, {
      title: "ControlledChaos",
      body: message,
      url: `/tasks?taskId=${reminder.taskId}`,
      tag: dedupKey,
      taskId: reminder.taskId,
      userId,
      actions: TASK_ACTIONS,
      bypassQuietHours: reminder.intervalMinutes <= 30,
    });
    if (sent) markSent();
  }

  // --- Event Reminders ---
  const eventReminders = await getEventReminders(userId, notificationPrefs);
  for (const reminder of eventReminders) {
    const priority = reminder.intervalMinutes <= 60 ? "high" : "normal";
    const bypassQH = reminder.intervalMinutes <= 30;
    if (!canSend(priority, bypassQH)) continue;

    const dedupKey = `event-${reminder.eventId}-${reminder.intervalMinutes}-${reminder.startTime.toISOString()}`;
    if (await hasEverBeenNotified(userId, dedupKey)) continue;

    const message = await generatePushMessage(
      { type: "event_reminder", eventTitle: reminder.eventTitle, minutesUntil: reminder.intervalMinutes },
      personalityPrefs,
      timezone,
      mode,
      await getLocationName(),
      await getSnapshot()
    );
    const sent = await sendPushToUser(userId, {
      title: "ControlledChaos",
      body: message,
      url: "/calendar",
      tag: dedupKey,
      userId,
      actions: EVENT_ACTIONS,
      bypassQuietHours: reminder.intervalMinutes <= 30,
    });
    if (sent) markSent();
  }

  // --- Scheduled Task Alerts ---
  const alerts = await getScheduledTaskAlerts(userId);
  for (const alert of alerts) {
    if (!canSend("normal")) continue;

    const dedupKey = `scheduled-${alert.taskId}-${alert.scheduledFor.toISOString().slice(0, 16)}`;
    if (await hasBeenNotifiedToday(userId, dedupKey, timezone)) continue;

    const message = await generatePushMessage(
      { type: "scheduled", taskTitle: alert.taskTitle },
      personalityPrefs,
      timezone,
      mode,
      await getLocationName(),
      await getSnapshot()
    );
    const sent = await sendPushToUser(userId, {
      title: "ControlledChaos",
      body: message,
      url: `/tasks?taskId=${alert.taskId}`,
      tag: dedupKey,
      taskId: alert.taskId,
      userId,
      actions: TASK_ACTIONS,
    });
    if (sent) markSent();
  }

  // --- Missed Scheduled Task Follow-up (assertive only) ---
  if (mode === "assertive") {
    const missedAlerts = await getMissedScheduledTaskAlerts(userId);
    for (const alert of missedAlerts) {
      if (!canSend("normal")) continue;

      const dedupKey = `scheduled-missed-${alert.taskId}-${alert.scheduledFor.toISOString().slice(0, 13)}`;
      if (await hasBeenNotifiedToday(userId, dedupKey, timezone)) continue;

      const message = await generatePushMessage(
        { type: "scheduled_missed", taskTitle: alert.taskTitle },
        personalityPrefs,
        timezone,
        mode,
        await getLocationName(),
        await getSnapshot()
      );
      const sent = await sendPushToUser(userId, {
        title: "ControlledChaos",
        body: message,
        url: `/tasks?taskId=${alert.taskId}`,
        tag: dedupKey,
        taskId: alert.taskId,
        userId,
        actions: MISSED_TASK_ACTIONS,
      });
      if (sent) markSent();
    }
  }

  // --- Time to Leave Alerts ---
  const departureAlerts = await getDepartureAlerts(userId, timezone);
  for (const alert of departureAlerts) {
    if (!canSend("high", alert.level === "now")) continue;

    const dedupKey = `time-to-leave-${alert.eventId}-${alert.level}`;
    if (await hasBeenNotifiedToday(userId, dedupKey, timezone)) continue;

    const notifCtx = alert.level === "now"
      ? { type: "time_to_leave_now" as const, eventTitle: alert.eventTitle, destination: alert.destination, commuteMinutes: alert.commuteMinutes }
      : { type: "time_to_leave_soon" as const, eventTitle: alert.eventTitle, minutesUntilLeave: alert.minutesUntilLeave, destination: alert.destination, commuteMinutes: alert.commuteMinutes };

    const message = await generatePushMessage(
      notifCtx,
      personalityPrefs,
      timezone,
      mode,
      await getLocationName(),
      await getSnapshot()
    );
    const sent = await sendPushToUser(userId, {
      title: "ControlledChaos",
      body: message,
      url: "/calendar",
      tag: dedupKey,
      userId,
      bypassQuietHours: alert.level === "now",
    });
    if (sent) markSent();
  }

  // --- Medication Reminders (bundle meds scheduled at the same time slot) ---
  const medReminders = await getMedicationRemindersForWindow(userId, timezone);
  const todayStr = todayInTimezone(timezone);

  // Filter out reminders already covered today by either a per-med send or
  // a bundle covering this slot.
  const dueMeds: typeof medReminders = [];
  for (const med of medReminders) {
    const perMedKey = `med-${med.medicationId}-${med.timeSlot}`;
    const bundleKey = `med-bundle-${med.timeSlot}-${todayStr}`;
    if (await hasBeenNotifiedToday(userId, perMedKey, timezone)) continue;
    if (await hasBeenNotifiedToday(userId, bundleKey, timezone)) continue;
    dueMeds.push(med);
  }

  const bySlot = new Map<string, typeof medReminders>();
  for (const med of dueMeds) {
    const arr = bySlot.get(med.timeSlot) ?? [];
    arr.push(med);
    bySlot.set(med.timeSlot, arr);
  }

  for (const [timeSlot, meds] of bySlot) {
    if (!canSend("normal")) continue;

    if (meds.length === 1) {
      const med = meds[0];
      const sent = await sendPushToUser(userId, {
        title: "Medication Reminder",
        body: `Time for ${med.medicationName} (${med.dosage})`,
        url: "/settings?tab=medications",
        tag: `med-${med.medicationId}-${timeSlot}`,
        userId,
        medicationId: med.medicationId,
        scheduledTime: timeSlot,
        actions: MED_ACTIONS,
        bypassQuietHours: true,
      });
      if (sent) markSent();
    } else {
      const sent = await sendPushToUser(userId, {
        title: "Medication Reminder",
        body: formatMedBundleBody(meds),
        url: "/settings?tab=medications",
        tag: `med-bundle-${timeSlot}-${todayStr}`,
        userId,
        medicationIds: meds.map((m) => m.medicationId),
        scheduledTime: timeSlot,
        actions: BUNDLED_MED_ACTIONS,
        bypassQuietHours: true,
      });
      if (sent) markSent();
    }
  }

  // --- Daily Idle Check-in (at most one per day, in user's chosen window) ---
  const checkInConfig = resolveDailyCheckInConfig(notificationPrefs);
  const checkInDedupKey = `idle-checkin-${todayInTimezone(timezone)}`;
  if (!checkInConfig.enabled) {
    console.log(`[Push][CheckIn] skip user=${userId} reason=disabled`);
  } else if (!canSend("normal")) {
    console.log(`[Push][CheckIn] skip user=${userId} reason=daily_cap_reached cap=${dailyCap} sentToday=${sentToday}`);
  } else if (await hasBeenNotifiedToday(userId, checkInDedupKey, timezone)) {
    console.log(`[Push][CheckIn] skip user=${userId} reason=already_notified_today`);
  } else {
    const status =
      checkInConfig.window === "morning"
        ? await shouldSendIdleCheckin(userId, timezone)
        : checkInConfig.window === "afternoon"
          ? await shouldSendAfternoonCheckin(userId, timezone)
          : await getEveningCheckinStatus(userId, timezone);
    if (!status.shouldSend) {
      console.log(`[Push][CheckIn] skip user=${userId} reason=outside_window_or_not_due window=${checkInConfig.window}`);
    } else {
      const locName = await getLocationName();
      const topTask = await getTopPendingTaskTitle(userId, locName);
      const messageType =
        checkInConfig.window === "morning"
          ? "idle_checkin"
          : checkInConfig.window === "afternoon"
            ? "idle_checkin_afternoon"
            : "idle_checkin_evening";
      const message = await generatePushMessage(
        { type: messageType, topTaskTitle: topTask, activityLevel: status.activityLevel },
        personalityPrefs,
        timezone,
        mode,
        locName,
        await getSnapshot()
      );
      const sent = await sendPushToUser(userId, {
        title: "ControlledChaos",
        body: message,
        url: topTask ? "/tasks" : "/dump",
        tag: checkInDedupKey,
        userId,
        actions: IDLE_ACTIONS,
      });
      if (sent) {
        markSent();
        console.log(`[Push][CheckIn] sent user=${userId} window=${checkInConfig.window}`);
      }
    }
  }

  // --- Inactivity Nudge ---
  const nudge = canSend("normal") ? await getInactivityNudgeTier(userId, timezone) : null;
  if (nudge) {
    const nudgeDedupKey = `nudge-tier-${nudge.tier}-${nudge.streakKey}`;
    if (!(await hasEverBeenNotified(userId, nudgeDedupKey))) {
      const message = await generateNudgeMessage(
        nudge.tier,
        nudge.hoursInactive,
        personalityPrefs,
        timezone,
        mode,
        await getLocationName(),
        await getSnapshot()
      );
      const sent = await sendPushToUser(userId, {
        title: "ControlledChaos",
        body: message,
        url: "/tasks",
        tag: nudgeDedupKey,
        userId,
      });
      if (sent) markSent();
    }
  }

  // --- Crisis Detection ---
  if (crisisDetectionTier !== "off") {
    try {
      const crisisResult = await runCrisisDetection({
        userId,
        timezone,
        tier: crisisDetectionTier,
        personalityPrefs,
        notificationPrefs,
        assertivenessMode: mode,
        getSnapshot,
        getLocationName,
      });
      if (crisisResult.notificationSent) markSent();
    } catch (err) {
      console.error(`[CrisisDetection] Error for user=${userId}:`, err);
    }
  }

  return userSent;
}

/**
 * GET /api/cron/push-triggers
 * Runs every 15 minutes via Vercel cron.
 * Checks all push-enabled users for deadline reminders, event reminders, scheduled task alerts,
 * a single daily idle check-in (at the user's chosen window), inactivity nudges, and pending snoozed pushes.
 */
export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();

  try {
    // --- Fire snoozed pushes (not per-user — check the whole table) ---
    const snoozed = await getPendingSnoozedPushes();
    let totalSent = 0;
    let userFailures = 0;

    for (const item of snoozed) {
      const p = item.payload as { title: string; body: string; url?: string; tag?: string };
      const sent = await sendPushToUser(item.userId, {
        title: p.title,
        body: p.body,
        url: p.url,
        tag: p.tag ? `${p.tag}-snoozed` : undefined,
        userId: item.userId,
        actions: TASK_ACTIONS,
        bypassQuietHours: false,
      });
      if (sent) {
        await markSnoozedPushSent(item.id);
        totalSent++;
      }
    }

    // --- Per-user triggers (chunked parallel) ---
    const users = await getAllUsersWithPushEnabled();

    for (let i = 0; i < users.length; i += USER_CONCURRENCY) {
      const chunk = users.slice(i, i + USER_CONCURRENCY);
      const results = await Promise.allSettled(chunk.map(processUser));
      for (let j = 0; j < results.length; j++) {
        const r = results[j];
        if (r.status === "fulfilled") {
          totalSent += r.value;
        } else {
          userFailures++;
          console.error(`[Push] user=${chunk[j].userId} failed:`, r.reason);
        }
      }
    }

    const durationMs = Date.now() - startedAt;
    console.log(
      `[Cron][push-triggers] users=${users.length} sent=${totalSent} snoozed=${snoozed.length} failures=${userFailures} durationMs=${durationMs}`
    );

    return NextResponse.json({
      success: true,
      usersChecked: users.length,
      snoozedFired: snoozed.length,
      notificationsSent: totalSent,
      userFailures,
      durationMs,
    });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    console.error(`[Cron] push-triggers error after ${durationMs}ms:`, error);
    return NextResponse.json({ error: "Cron job failed" }, { status: 500 });
  }
}

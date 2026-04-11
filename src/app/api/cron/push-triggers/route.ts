import { NextResponse } from "next/server";
import {
  getAllUsersWithPushEnabled,
  getPendingSnoozedPushes,
  markSnoozedPushSent,
  getUserLocation,
} from "@/lib/db/queries";
import { sendPushToUser } from "@/lib/notifications/send-push";
import {
  getDeadlineWarnings,
  getDailyPushCap,
  getAssertivenessMode,
  getScheduledTaskAlerts,
  getMissedScheduledTaskAlerts,
  getPushNotificationsSentToday,
  shouldSendIdleCheckin,
  shouldSendAfternoonCheckin,
  getEveningCheckinStatus,
  hasBeenNotifiedToday,
  hasEverBeenNotified,
  getInactivityNudgeTier,
  generateNudgeMessage,
  generatePushMessage,
  getTopPendingTaskTitle,
} from "@/lib/notifications/triggers";

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

/**
 * GET /api/cron/push-triggers
 * Runs every 15 minutes via Vercel cron.
 * Checks all push-enabled users for deadline warnings, scheduled task alerts,
 * idle check-ins (11am + 3pm + 6:00pm), inactivity nudges, and pending snoozed pushes.
 */
export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // --- Fire snoozed pushes (not per-user — check the whole table) ---
    const snoozed = await getPendingSnoozedPushes();
    let totalSent = 0;

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

    // --- Per-user triggers ---
    const users = await getAllUsersWithPushEnabled();

    for (const { userId, timezone, personalityPrefs, notificationPrefs } of users) {
      const mode = getAssertivenessMode(notificationPrefs);
      const dailyCap = getDailyPushCap(mode);
      let sentToday = await getPushNotificationsSentToday(userId);

      // Fetch user's current location for context-aware notifications
      const userLoc = await getUserLocation(userId);
      const locationName = userLoc?.matchedLocationName ?? undefined;

      const canSend = (priority: "high" | "normal") =>
        priority === "high" || sentToday < dailyCap;

      const markSent = () => {
        sentToday += 1;
        totalSent += 1;
      };

      // --- Deadline Warnings ---
      const warnings = await getDeadlineWarnings(userId);
      for (const warning of warnings) {
        const priority = warning.level === "30min" || warning.level === "2h" ? "high" : "normal";
        if (!canSend(priority)) continue;

        const dedupKey = `deadline-${warning.taskId}-${warning.level}`;
        if (await hasBeenNotifiedToday(userId, dedupKey)) continue;

        const message = await generatePushMessage(
          { type: `deadline_${warning.level}` as "deadline_24h" | "deadline_2h" | "deadline_30min", taskTitle: warning.taskTitle },
          personalityPrefs,
          timezone,
          mode,
          locationName
        );
        const sent = await sendPushToUser(userId, {
          title: "ControlledChaos",
          body: message,
          url: `/tasks?taskId=${warning.taskId}`,
          tag: dedupKey,
          taskId: warning.taskId,
          userId,
          actions: TASK_ACTIONS,
          bypassQuietHours: warning.level === "30min",
        });
        if (sent) markSent();
      }

      // --- Scheduled Task Alerts ---
      const alerts = await getScheduledTaskAlerts(userId);
      for (const alert of alerts) {
        if (!canSend("normal")) continue;

        const dedupKey = `scheduled-${alert.taskId}-${alert.scheduledFor.toISOString().slice(0, 16)}`;
        if (await hasBeenNotifiedToday(userId, dedupKey)) continue;

        const message = await generatePushMessage(
          { type: "scheduled", taskTitle: alert.taskTitle },
          personalityPrefs,
          timezone,
          mode,
          locationName
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
          if (await hasBeenNotifiedToday(userId, dedupKey)) continue;

          const message = await generatePushMessage(
            { type: "scheduled_missed", taskTitle: alert.taskTitle },
            personalityPrefs,
            timezone,
            mode,
            locationName
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

      // --- Morning Idle Check-in (11am+) ---
      const morningDedupKey = `idle-checkin-${new Date().toISOString().slice(0, 10)}`;
      if (canSend("normal") && !(await hasBeenNotifiedToday(userId, morningDedupKey))) {
        const morningStatus = await shouldSendIdleCheckin(userId, timezone);
        if (morningStatus.shouldSend) {
          const topTask = await getTopPendingTaskTitle(userId, locationName);
          const message = await generatePushMessage(
            { type: "idle_checkin", topTaskTitle: topTask, activityLevel: morningStatus.activityLevel },
            personalityPrefs,
            timezone,
            mode,
            locationName
          );
          const sent = await sendPushToUser(userId, {
            title: "ControlledChaos",
            body: message,
            url: "/dump",
            tag: morningDedupKey,
            userId,
            actions: IDLE_ACTIONS,
          });
          if (sent) markSent();
        }
      }

      // --- Afternoon Idle Check-in (3pm+) ---
      const afternoonDedupKey = `idle-checkin-afternoon-${new Date().toISOString().slice(0, 10)}`;
      if (mode !== "gentle" && canSend("normal") && !(await hasBeenNotifiedToday(userId, afternoonDedupKey))) {
        const afternoonStatus = await shouldSendAfternoonCheckin(userId, timezone);
        if (afternoonStatus.shouldSend) {
          const topTask = await getTopPendingTaskTitle(userId, locationName);
          const message = await generatePushMessage(
            { type: "idle_checkin_afternoon", topTaskTitle: topTask, activityLevel: afternoonStatus.activityLevel },
            personalityPrefs,
            timezone,
            mode,
            locationName
          );
          const sent = await sendPushToUser(userId, {
            title: "ControlledChaos",
            body: message,
            url: topTask ? "/tasks" : "/dump",
            tag: afternoonDedupKey,
            userId,
            actions: IDLE_ACTIONS,
          });
          if (sent) markSent();
        }
      }

      // --- Evening Idle Check-in (7:00pm+) ---
      const eveningDedupKey = `idle-checkin-evening-${new Date().toISOString().slice(0, 10)}`;
      if (mode === "gentle") {
        console.log(`[Push][Evening] skip user=${userId} reason=gentle_mode`);
      } else if (!canSend("normal")) {
        console.log(`[Push][Evening] skip user=${userId} reason=daily_cap_reached cap=${dailyCap} sentToday=${sentToday}`);
      } else if (await hasBeenNotifiedToday(userId, eveningDedupKey)) {
        console.log(`[Push][Evening] skip user=${userId} reason=already_notified_today`);
      } else {
        const eveningStatus = await getEveningCheckinStatus(userId, timezone);
        if (!eveningStatus.shouldSend) {
          console.log(`[Push][Evening] skip user=${userId} reason=${eveningStatus.reason}`);
        } else {
          const topTask = await getTopPendingTaskTitle(userId, locationName);
          const message = await generatePushMessage(
            { type: "idle_checkin_evening", topTaskTitle: topTask, activityLevel: eveningStatus.activityLevel },
            personalityPrefs,
            timezone,
            mode,
            locationName
          );
          const sent = await sendPushToUser(userId, {
            title: "ControlledChaos",
            body: message,
            url: topTask ? "/tasks" : "/dump",
            tag: eveningDedupKey,
            userId,
            actions: IDLE_ACTIONS,
          });

          if (sent) {
            markSent();
            console.log(`[Push][Evening] sent user=${userId}`);
          } else {
            console.log(`[Push][Evening] not_sent user=${userId} reason=no_active_subscriptions_or_push_blocked`);
          }
        }
      }

      // --- Inactivity Nudge ---
      const nudge = canSend("normal") ? await getInactivityNudgeTier(userId) : null;
      if (nudge) {
        const nudgeDedupKey = `nudge-tier-${nudge.tier}-${nudge.streakKey}`;
        if (!(await hasEverBeenNotified(userId, nudgeDedupKey))) {
          const message = await generateNudgeMessage(
            nudge.tier,
            nudge.hoursInactive,
            personalityPrefs,
            timezone,
            mode,
            locationName
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
    }

    return NextResponse.json({
      success: true,
      usersChecked: users.length,
      snoozedFired: snoozed.length,
      notificationsSent: totalSent,
    });
  } catch (error) {
    console.error("[Cron] push-triggers error:", error);
    return NextResponse.json({ error: "Cron job failed" }, { status: 500 });
  }
}

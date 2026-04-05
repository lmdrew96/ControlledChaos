import { NextResponse } from "next/server";
import {
  getAllUsersWithPushEnabled,
  getPendingSnoozedPushes,
  markSnoozedPushSent,
} from "@/lib/db/queries";
import { sendPushToUser } from "@/lib/notifications/send-push";
import {
  getDeadlineWarnings,
  getScheduledTaskAlerts,
  shouldSendIdleCheckin,
  shouldSendAfternoonCheckin,
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

/**
 * GET /api/cron/push-triggers
 * Runs every 15 minutes via Vercel cron.
 * Checks all push-enabled users for deadline warnings, scheduled task alerts,
 * idle check-ins (11am + 3pm), inactivity nudges, and pending snoozed pushes.
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

    for (const { userId, timezone } of users) {
      // --- Deadline Warnings ---
      const warnings = await getDeadlineWarnings(userId);
      for (const warning of warnings) {
        const dedupKey = `deadline-${warning.taskId}-${warning.level}`;
        if (await hasBeenNotifiedToday(userId, dedupKey)) continue;

        const message = await generatePushMessage({
          type: `deadline_${warning.level}` as "deadline_24h" | "deadline_2h" | "deadline_30min",
          taskTitle: warning.taskTitle,
        });
        const sent = await sendPushToUser(userId, {
          title: "ControlledChaos",
          body: message,
          url: `/tasks?taskId=${warning.taskId}`,
          tag: dedupKey,
          taskId: warning.taskId,
          userId,
          actions: TASK_ACTIONS,
        });
        if (sent) totalSent++;
      }

      // --- Scheduled Task Alerts ---
      const alerts = await getScheduledTaskAlerts(userId);
      for (const alert of alerts) {
        const dedupKey = `scheduled-${alert.taskId}-${alert.scheduledFor.toISOString().slice(0, 16)}`;
        if (await hasBeenNotifiedToday(userId, dedupKey)) continue;

        const message = await generatePushMessage({ type: "scheduled", taskTitle: alert.taskTitle });
        const sent = await sendPushToUser(userId, {
          title: "ControlledChaos",
          body: message,
          url: `/tasks?taskId=${alert.taskId}`,
          tag: dedupKey,
          taskId: alert.taskId,
          userId,
          actions: TASK_ACTIONS,
        });
        if (sent) totalSent++;
      }

      // --- Morning Idle Check-in (11am+) ---
      const morningDedupKey = `idle-checkin-${new Date().toISOString().slice(0, 10)}`;
      if (!(await hasBeenNotifiedToday(userId, morningDedupKey))) {
        const shouldNotify = await shouldSendIdleCheckin(userId, timezone);
        if (shouldNotify) {
          const topTask = await getTopPendingTaskTitle(userId);
          const message = await generatePushMessage({ type: "idle_checkin", topTaskTitle: topTask });
          const sent = await sendPushToUser(userId, {
            title: "ControlledChaos",
            body: message,
            url: "/dump",
            tag: morningDedupKey,
            userId,
            actions: IDLE_ACTIONS,
          });
          if (sent) totalSent++;
        }
      }

      // --- Afternoon Idle Check-in (3pm+) ---
      const afternoonDedupKey = `idle-checkin-afternoon-${new Date().toISOString().slice(0, 10)}`;
      if (!(await hasBeenNotifiedToday(userId, afternoonDedupKey))) {
        const shouldNotify = await shouldSendAfternoonCheckin(userId, timezone);
        if (shouldNotify) {
          const topTask = await getTopPendingTaskTitle(userId);
          const message = await generatePushMessage({ type: "idle_checkin_afternoon", topTaskTitle: topTask });
          const sent = await sendPushToUser(userId, {
            title: "ControlledChaos",
            body: message,
            url: topTask ? "/tasks" : "/dump",
            tag: afternoonDedupKey,
            userId,
            actions: IDLE_ACTIONS,
          });
          if (sent) totalSent++;
        }
      }

      // --- Inactivity Nudge ---
      const nudge = await getInactivityNudgeTier(userId);
      if (nudge) {
        const nudgeDedupKey = `nudge-tier-${nudge.tier}-${nudge.streakKey}`;
        if (!(await hasEverBeenNotified(userId, nudgeDedupKey))) {
          const message = await generateNudgeMessage(nudge.tier, nudge.hoursInactive);
          const sent = await sendPushToUser(userId, {
            title: "ControlledChaos",
            body: message,
            url: "/tasks",
            tag: nudgeDedupKey,
            userId,
          });
          if (sent) totalSent++;
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

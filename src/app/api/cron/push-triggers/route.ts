import { NextResponse } from "next/server";
import { getAllUsersWithPushEnabled } from "@/lib/db/queries";
import { sendPushToUser } from "@/lib/notifications/send-push";
import {
  getDeadlineWarnings,
  getScheduledTaskAlerts,
  shouldSendIdleCheckin,
  hasBeenNotifiedToday,
  hasEverBeenNotified,
  getInactivityNudgeTier,
  generateNudgeMessage,
  generatePushMessage,
} from "@/lib/notifications/triggers";

/**
 * GET /api/cron/push-triggers
 * Runs every 15 minutes via Vercel cron.
 * Checks all push-enabled users for deadline warnings, scheduled task alerts,
 * and idle check-ins. Sends push notifications with dedup.
 */
export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const users = await getAllUsersWithPushEnabled();
    let totalSent = 0;

    for (const { userId, timezone } of users) {
      // --- Deadline Warnings ---
      const warnings = await getDeadlineWarnings(userId);
      for (const warning of warnings) {
        const dedupKey = `deadline-${warning.taskId}-${warning.level}`;
        const alreadySent = await hasBeenNotifiedToday(userId, dedupKey);
        if (alreadySent) continue;

        const message = await generatePushMessage({
          type: `deadline_${warning.level}` as "deadline_24h" | "deadline_2h" | "deadline_30min",
          taskTitle: warning.taskTitle,
        });
        const sent = await sendPushToUser(userId, {
          title: "ControlledChaos",
          body: message,
          url: "/tasks",
          tag: dedupKey,
        });
        if (sent) totalSent++;
      }

      // --- Scheduled Task Alerts ---
      const alerts = await getScheduledTaskAlerts(userId);
      for (const alert of alerts) {
        const dedupKey = `scheduled-${alert.taskId}-${alert.scheduledFor.toISOString().slice(0, 16)}`;
        const alreadySent = await hasBeenNotifiedToday(userId, dedupKey);
        if (alreadySent) continue;

        const message = await generatePushMessage({ type: "scheduled", taskTitle: alert.taskTitle });
        const sent = await sendPushToUser(userId, {
          title: "ControlledChaos",
          body: message,
          url: "/tasks",
          tag: dedupKey,
        });
        if (sent) totalSent++;
      }

      // --- Idle Check-in ---
      const idleDedupKey = `idle-checkin-${new Date().toISOString().slice(0, 10)}`;
      const alreadySentIdle = await hasBeenNotifiedToday(userId, idleDedupKey);
      if (!alreadySentIdle) {
        const shouldNotify = await shouldSendIdleCheckin(userId, timezone);
        if (shouldNotify) {
          const message = await generatePushMessage({ type: "idle_checkin" });
          const sent = await sendPushToUser(userId, {
            title: "ControlledChaos",
            body: message,
            url: "/dump",
            tag: idleDedupKey,
          });
          if (sent) totalSent++;
        }
      }

      // --- Inactivity Nudge ---
      const nudge = await getInactivityNudgeTier(userId);
      if (nudge) {
        const nudgeDedupKey = `nudge-tier-${nudge.tier}-${nudge.streakKey}`;
        const alreadySentNudge = await hasEverBeenNotified(userId, nudgeDedupKey);
        if (!alreadySentNudge) {
          const message = await generateNudgeMessage(nudge.tier, nudge.hoursInactive);
          const sent = await sendPushToUser(userId, {
            title: "ControlledChaos",
            body: message,
            url: "/tasks",
            tag: nudgeDedupKey,
          });
          if (sent) totalSent++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      usersChecked: users.length,
      notificationsSent: totalSent,
    });
  } catch (error) {
    console.error("[Cron] push-triggers error:", error);
    return NextResponse.json(
      { error: "Cron job failed" },
      { status: 500 }
    );
  }
}

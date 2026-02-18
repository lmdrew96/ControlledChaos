import { NextResponse } from "next/server";
import { getAllUsersWithPushEnabled } from "@/lib/db/queries";
import { sendPushToUser } from "@/lib/notifications/send-push";
import {
  getDeadlineWarnings,
  getScheduledTaskAlerts,
  shouldSendIdleCheckin,
  hasBeenNotifiedToday,
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

        const message = deadlineMessage(warning.taskTitle, warning.level);
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

        const sent = await sendPushToUser(userId, {
          title: "ControlledChaos",
          body: `Time for ${alert.taskTitle}! You planned this — past-you had your back.`,
          url: "/tasks",
          tag: dedupKey,
        });
        if (sent) totalSent++;
      }

      // --- Idle Check-in ---
      const dedupKey = `idle-checkin-${new Date().toISOString().slice(0, 10)}`;
      const alreadySentIdle = await hasBeenNotifiedToday(userId, dedupKey);
      if (!alreadySentIdle) {
        const shouldNotify = await shouldSendIdleCheckin(userId, timezone);
        if (shouldNotify) {
          const sent = await sendPushToUser(userId, {
            title: "ControlledChaos",
            body: "Hey! Got anything on your mind? Quick brain dump?",
            url: "/dump",
            tag: dedupKey,
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

function deadlineMessage(
  taskTitle: string,
  level: "24h" | "2h" | "30min"
): string {
  switch (level) {
    case "24h":
      return `Heads up — ${taskTitle} is due tomorrow. You've got this.`;
    case "2h":
      return `${taskTitle} is due in about 2 hours. Want to knock it out?`;
    case "30min":
      return `${taskTitle} is due in 30 minutes — quick check, is it done?`;
  }
}

import { NextResponse } from "next/server";
import { getAllUsersWithCalendars } from "@/lib/db/queries";
import { syncCanvasCalendar } from "@/lib/calendar/sync-canvas";
import { sendPushToUser } from "@/lib/notifications/send-push";
import { hasBeenNotifiedToday } from "@/lib/notifications/triggers";
import { todayInTimezone } from "@/lib/timezone";

/**
 * GET /api/cron/calendar-sync
 * Runs every 15 minutes via Vercel cron.
 * Syncs all users' Canvas calendars so the AI always has fresh data.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const usersWithCalendars = await getAllUsersWithCalendars();

    let synced = 0;
    let failed = 0;

    for (const user of usersWithCalendars) {
      if (user.canvasIcalUrl) {
        try {
          await syncCanvasCalendar(
            user.userId,
            user.canvasIcalUrl,
            user.timezone ?? "America/New_York"
          );
          synced++;
        } catch (err) {
          console.error(
            `[Cron] Canvas sync failed for ${user.userId}:`,
            err
          );
          failed++;

          // If Canvas returned 401, the user's iCal token has expired.
          // Send them a push notification (once per day) so they know to update it.
          const is401 =
            err instanceof Error && err.message.includes("401");
          if (is401) {
            const dedupKey = `canvas-expired-${todayInTimezone(user.timezone ?? "America/New_York")}`;
            hasBeenNotifiedToday(user.userId, dedupKey, user.timezone ?? "America/New_York")
              .then((alreadyNotified) => {
                if (!alreadyNotified) {
                  return sendPushToUser(user.userId, {
                    title: "ControlledChaos",
                    body: "Your Canvas calendar link has expired. Tap to update it in Settings.",
                    url: "/settings",
                    tag: dedupKey,
                    bypassQuietHours: false,
                  });
                }
              })
              .catch((e) =>
                console.error("[Cron] Failed to send Canvas-expired push:", e)
              );
          }
        }
      }
    }

    console.log(
      `[Cron] Calendar sync complete: ${synced} synced, ${failed} failed`
    );

    return NextResponse.json({
      success: true,
      synced,
      failed,
      usersChecked: usersWithCalendars.length,
    });
  } catch (error) {
    console.error("[Cron] Calendar sync error:", error);
    return NextResponse.json(
      { error: "Calendar sync cron failed" },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { getAllUsersWithCalendars, getUserSettings } from "@/lib/db/queries";
import { syncCanvasCalendar } from "@/lib/calendar/sync-canvas";
import { sendPushToUser } from "@/lib/notifications/send-push";
import { hasBeenNotifiedToday, recordDroppedAlert } from "@/lib/notifications/triggers";
import { isQuietHours } from "@/lib/notifications/quiet-hours";
import type { NotificationPrefs } from "@/types";
import { todayInTimezone } from "@/lib/timezone";
import { verifyCronRequest } from "@/lib/cron-auth";


/**
 * One Canvas-expired push per day, with one chance: outside quiet hours it
 * either goes out or is recorded as dropped. It used to retry on every
 * 15-minute sync whenever the send was refused.
 */
async function notifyCanvasExpired(userId: string, timezone: string): Promise<void> {
  const dedupKey = `canvas-expired-${todayInTimezone(timezone)}`;
  if (await hasBeenNotifiedToday(userId, dedupKey, timezone)) return;

  const prefs = (await getUserSettings(userId))?.notificationPrefs as NotificationPrefs | null;
  // Quiet hours hold it; the first sync after they end gets the one chance.
  if (prefs && isQuietHours(prefs, timezone)) return;

  const sent = await sendPushToUser(userId, {
    title: "ControlledChaos",
    body: "Your Canvas calendar link has expired. Tap to update it in Settings.",
    url: "/settings",
    tag: dedupKey,
    bypassQuietHours: false,
  });
  if (!sent) await recordDroppedAlert(userId, [dedupKey], "send_refused");
}

/**
 * POST /api/cron/calendar-sync
 * Triggered by a QStash schedule (falls back to CRON_SECRET bearer auth for manual/local calls).
 * Syncs all users' Canvas calendars so the AI always has fresh data.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!(await verifyCronRequest(request, rawBody))) {
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
            user,
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
            await notifyCanvasExpired(user.userId, user.timezone ?? "America/New_York").catch(
              (e) => console.error("[Cron] Failed to send Canvas-expired push:", e)
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

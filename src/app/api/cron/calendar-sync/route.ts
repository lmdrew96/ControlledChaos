import { NextResponse } from "next/server";
import { getAllUsersWithCalendars, getUserSettings } from "@/lib/db/queries";
import { syncCanvasCalendar, CanvasFetchError } from "@/lib/calendar/sync-canvas";
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
    title: "Canvas link expired",
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
    let expired = 0;

    for (const user of usersWithCalendars) {
      if (user.canvasIcalUrl) {
        const timezone = user.timezone ?? "America/New_York";

        // Canvas already refused this link. Fetching again only fails again,
        // so wait for a new link (Settings clears the flag). The push still
        // gets its chance for a day, in case quiet hours held the first one.
        if (user.canvasAuthFailedAt) {
          expired++;
          if (Date.now() - user.canvasAuthFailedAt.getTime() < 24 * 60 * 60 * 1000) {
            await notifyCanvasExpired(user.userId, timezone).catch(
              (e) => console.error("[Cron] Failed to send Canvas-expired push:", e)
            );
          }
          continue;
        }

        try {
          await syncCanvasCalendar(user.userId, user, timezone);
          synced++;
        } catch (err) {
          // The message goes first, as text: Workers Observability showed
          // only the minified stack when handed the Error object.
          const cause = err instanceof Error && err.cause ? ` (cause: ${String(err.cause)})` : "";
          console.error(
            `[Cron] Canvas sync failed for ${user.userId}: ${
              err instanceof Error ? `${err.name}: ${err.message}` : String(err)
            }${cause}`
          );
          failed++;

          // If Canvas returned 401, the user's iCal token has expired.
          // syncCanvasCalendar recorded it; tell them so they can update it.
          if (err instanceof CanvasFetchError && err.status === 401) {
            await notifyCanvasExpired(user.userId, timezone).catch(
              (e) => console.error("[Cron] Failed to send Canvas-expired push:", e)
            );
          }
        }
      }
    }

    console.log(
      `[Cron] Calendar sync complete: ${synced} synced, ${failed} failed, ${expired} skipped (Canvas link expired)`
    );

    return NextResponse.json({
      success: true,
      synced,
      failed,
      expired,
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

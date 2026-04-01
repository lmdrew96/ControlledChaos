import { NextResponse } from "next/server";
import { getAllUsersWithCalendars } from "@/lib/db/queries";
import { syncCanvasCalendar } from "@/lib/calendar/sync-canvas";

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

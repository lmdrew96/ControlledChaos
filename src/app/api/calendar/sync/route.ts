import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getUserSettings } from "@/lib/db/queries";
import { syncCanvasCalendar } from "@/lib/calendar/sync-canvas";
import { syncGoogleCalendar } from "@/lib/calendar/sync-google";
import type { CalendarSyncResult } from "@/types";

export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const settings = await getUserSettings(userId);

    let canvasResult: CalendarSyncResult | null = null;
    let googleResult: CalendarSyncResult | null = null;
    const errors: string[] = [];

    // Sync Canvas if configured
    if (settings?.canvasIcalUrl) {
      try {
        canvasResult = await syncCanvasCalendar(
          userId,
          settings.canvasIcalUrl
        );
      } catch (err) {
        console.error("[API] Canvas sync failed:", err);
        errors.push(
          `Canvas: ${err instanceof Error ? err.message : "sync failed"}`
        );
      }
    }

    // Sync Google if connected
    if (settings?.googleCalConnected) {
      try {
        const calIds = (settings.googleCalendarIds as string[] | null) ?? null;
        googleResult = await syncGoogleCalendar(userId, calIds);
      } catch (err) {
        console.error("[API] Google sync failed:", err);
        errors.push(
          `Google: ${err instanceof Error ? err.message : "sync failed"}`
        );
      }
    }

    if (!canvasResult && !googleResult && errors.length === 0) {
      return NextResponse.json(
        {
          error:
            "No calendars configured. Add Canvas iCal URL or connect Google Calendar in Settings.",
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: errors.length === 0,
      canvas: canvasResult,
      google: googleResult,
      errors: errors.length > 0 ? errors : undefined,
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[API] POST /api/calendar/sync error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to sync calendar";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getUser, getUserSettings } from "@/lib/db/queries";
import { syncCanvasCalendar } from "@/lib/calendar/sync-canvas";
import type { CalendarSyncResult } from "@/types";

export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [user, settings] = await Promise.all([
      getUser(userId),
      getUserSettings(userId),
    ]);
    const timezone = user?.timezone ?? "America/New_York";

    let canvasResult: CalendarSyncResult | null = null;
    const errors: string[] = [];

    // Sync Canvas if configured
    if (settings?.canvasIcalUrl) {
      try {
        canvasResult = await syncCanvasCalendar(
          userId,
          settings.canvasIcalUrl,
          timezone
        );
      } catch (err) {
        console.error("[API] Canvas sync failed:", err);
        errors.push(
          `Canvas: ${err instanceof Error ? err.message : "sync failed"}`
        );
      }
    }

    if (!canvasResult && errors.length === 0) {
      return NextResponse.json(
        {
          error:
            "No calendars configured. Add your Canvas iCal URL in Settings.",
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: errors.length === 0,
      canvas: canvasResult,
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

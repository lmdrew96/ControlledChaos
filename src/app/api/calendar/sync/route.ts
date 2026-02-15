import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getUserSettings } from "@/lib/db/queries";
import { syncCanvasCalendar } from "@/lib/calendar/sync-canvas";

export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const settings = await getUserSettings(userId);
    if (!settings?.canvasIcalUrl) {
      return NextResponse.json(
        { error: "No Canvas iCal URL configured. Add it in Settings." },
        { status: 400 }
      );
    }

    const result = await syncCanvasCalendar(userId, settings.canvasIcalUrl);

    return NextResponse.json({
      success: true,
      ...result,
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[API] POST /api/calendar/sync error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to sync calendar";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

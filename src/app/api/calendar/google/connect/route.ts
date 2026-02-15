import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { updateUserSettings } from "@/lib/db/queries";
import { getGoogleAccessToken } from "@/lib/calendar/google-auth";
import { syncGoogleCalendar } from "@/lib/calendar/sync-google";

export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify the token actually works
    const token = await getGoogleAccessToken(userId);
    if (!token) {
      return NextResponse.json(
        {
          error:
            "No Google account linked. Please connect your Google account first.",
        },
        { status: 400 }
      );
    }

    // Mark as connected
    await updateUserSettings(userId, { googleCalConnected: true });

    // Trigger initial sync
    const syncResult = await syncGoogleCalendar(userId);

    return NextResponse.json({
      success: true,
      connected: true,
      ...syncResult,
    });
  } catch (error) {
    console.error("[API] POST /api/calendar/google/connect error:", error);
    const message =
      error instanceof Error
        ? error.message
        : "Failed to connect Google Calendar";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

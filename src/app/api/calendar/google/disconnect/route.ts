import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  updateUserSettings,
  deleteStaleCalendarEvents,
} from "@/lib/db/queries";

export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Remove all Google events from DB
    await deleteStaleCalendarEvents(userId, "google", []);

    // Mark as disconnected
    await updateUserSettings(userId, { googleCalConnected: false });

    return NextResponse.json({ success: true, connected: false });
  } catch (error) {
    console.error("[API] POST /api/calendar/google/disconnect error:", error);
    return NextResponse.json(
      { error: "Failed to disconnect Google Calendar" },
      { status: 500 }
    );
  }
}

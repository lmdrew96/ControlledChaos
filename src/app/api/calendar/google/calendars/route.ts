import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getGoogleAccessToken } from "@/lib/calendar/google-auth";
import { createGoogleCalendarClient } from "@/lib/calendar/google";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const accessToken = await getGoogleAccessToken(userId);
    if (!accessToken) {
      return NextResponse.json(
        { error: "Google Calendar not connected" },
        { status: 400 }
      );
    }

    const gcal = createGoogleCalendarClient(accessToken);
    const calendars = await gcal.listCalendars();

    const items = calendars.map((cal) => ({
      id: cal.id,
      name: cal.summary ?? cal.id,
      primary: cal.primary ?? false,
    }));

    return NextResponse.json({ calendars: items });
  } catch (error) {
    console.error("[API] GET /api/calendar/google/calendars error:", error);
    return NextResponse.json(
      { error: "Failed to fetch calendars" },
      { status: 500 }
    );
  }
}

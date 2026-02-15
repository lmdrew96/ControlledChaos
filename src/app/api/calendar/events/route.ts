import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getCalendarEventsByDateRange } from "@/lib/db/queries";

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const start = request.nextUrl.searchParams.get("start");
    const end = request.nextUrl.searchParams.get("end");

    if (!start || !end) {
      return NextResponse.json(
        { error: "start and end query parameters are required (ISO 8601)" },
        { status: 400 }
      );
    }

    const startDate = new Date(start);
    const endDate = new Date(end);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return NextResponse.json(
        { error: "Invalid date format. Use ISO 8601." },
        { status: 400 }
      );
    }

    const events = await getCalendarEventsByDateRange(
      userId,
      startDate,
      endDate
    );

    return NextResponse.json({ events });
  } catch (error) {
    console.error("[API] GET /api/calendar/events error:", error);
    return NextResponse.json(
      { error: "Failed to fetch calendar events" },
      { status: 500 }
    );
  }
}

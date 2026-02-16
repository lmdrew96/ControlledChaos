import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import {
  getCalendarEventsByDateRange,
  getUserSettings,
  createManualCalendarEvent,
} from "@/lib/db/queries";
import { expandRecurrence } from "@/lib/calendar/expand-recurrence";
import { writeEventToGoogle } from "@/lib/calendar/sync-google";

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

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { title, description, location, startTime, endTime, isAllDay, recurrence } =
      body as {
        title?: string;
        description?: string;
        location?: string;
        startTime?: string;
        endTime?: string;
        isAllDay?: boolean;
        recurrence?: {
          type: "daily" | "weekly";
          daysOfWeek?: number[];
          endDate?: string;
        };
      };

    if (!title?.trim()) {
      return NextResponse.json(
        { error: "Title is required" },
        { status: 400 }
      );
    }

    if (!startTime || !endTime) {
      return NextResponse.json(
        { error: "Start and end times are required" },
        { status: 400 }
      );
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return NextResponse.json(
        { error: "Invalid date format" },
        { status: 400 }
      );
    }

    if (end <= start) {
      return NextResponse.json(
        { error: "End time must be after start time" },
        { status: 400 }
      );
    }

    // Expand recurrence into individual instances
    const instances = expandRecurrence({
      title: title.trim(),
      description: description || null,
      location: location || null,
      startTime,
      endTime,
      isAllDay,
      recurrence,
    });

    const seriesId =
      instances.length > 1 ? crypto.randomUUID() : null;

    // Check if Google is connected for syncing
    const settings = await getUserSettings(userId);
    const syncToGoogle = settings?.googleCalConnected ?? false;

    const createdEvents = [];

    for (const instance of instances) {
      // Write to Google Calendar if connected
      if (syncToGoogle) {
        try {
          await writeEventToGoogle(userId, {
            title: instance.title,
            description: instance.description || undefined,
            startTime: instance.startTime.toISOString(),
            endTime: instance.endTime.toISOString(),
            timezone: "America/New_York",
          });
        } catch {
          // Non-critical — local creation continues
        }
      }

      const event = await createManualCalendarEvent({
        userId,
        title: instance.title,
        description: instance.description,
        startTime: instance.startTime,
        endTime: instance.endTime,
        location: instance.location,
        isAllDay: instance.isAllDay,
        seriesId,
      });

      createdEvents.push(event);
    }

    return NextResponse.json({
      events: createdEvents,
      seriesId,
      count: createdEvents.length,
    });
  } catch (error) {
    console.error("[API] POST /api/calendar/events error:", error);
    return NextResponse.json(
      { error: "Failed to create event" },
      { status: 500 }
    );
  }
}

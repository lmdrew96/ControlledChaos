import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import {
  getCalendarEventsByDateRange,
  getUser,
  getUserSettings,
  getLastCalendarSync,
  createManualCalendarEvent,
  updateCalendarEvent,
} from "@/lib/db/queries";
import { expandRecurrence } from "@/lib/calendar/expand-recurrence";
import { callHaiku } from "@/lib/ai";
import { AUTO_NOTE_EVENT_SYSTEM_PROMPT } from "@/lib/ai/prompts";
import { buildAIContext } from "@/lib/ai/context";

const SYNC_STALENESS_MS = 15 * 60 * 1000; // 15 minutes

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

    // Auto-sync Canvas if stale (> 15 minutes since last sync)
    const [user, settings] = await Promise.all([
      getUser(userId),
      getUserSettings(userId),
    ]);
    const tz = user?.timezone ?? "America/New_York";

    if (settings?.canvasIcalUrl) {
      const lastSync = await getLastCalendarSync(userId);
      const isStale =
        !lastSync ||
        Date.now() - lastSync.getTime() > SYNC_STALENESS_MS;

      if (isStale) {
        import("@/lib/calendar/sync-canvas")
          .then(({ syncCanvasCalendar }) =>
            syncCanvasCalendar(userId, settings.canvasIcalUrl!, tz)
          )
          .catch((err) =>
            console.error("[Calendar] Auto-sync Canvas failed:", err)
          );
      }
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
    const { title, description, location, startTime, endTime, isAllDay, recurrence, category } =
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
        category?: string;
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

    const createdEvents: Awaited<ReturnType<typeof createManualCalendarEvent>>[] = [];

    for (const instance of instances) {
      const validCategories = new Set(["school", "work", "personal", "errands", "health"]);
      const event = await createManualCalendarEvent({
        userId,
        title: instance.title,
        description: instance.description,
        startTime: instance.startTime,
        endTime: instance.endTime,
        location: instance.location,
        isAllDay: instance.isAllDay,
        seriesId,
        category: category && validCategories.has(category) ? category : null,
      });

      createdEvents.push(event);
    }

    // Generate AI note for the first event if no description was provided
    if (!description && createdEvents.length > 0) {
      const aiCtx = await buildAIContext(userId);
      const firstEvent = createdEvents[0];
      const eventTime = new Date(firstEvent.startTime).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
      const userPrompt = [
        `Event: "${firstEvent.title}"`,
        `Time: ${eventTime}`,
        firstEvent.location ? `Location: ${firstEvent.location}` : null,
        `\n${aiCtx.formatted}`,
      ]
        .filter(Boolean)
        .join(", ");

      try {
        const { text } = await callHaiku({
          system: AUTO_NOTE_EVENT_SYSTEM_PROMPT,
          user: userPrompt,
          maxTokens: 150,
        });
        const note = text.trim();
        if (note && note !== "SKIP") {
          // Apply the note to all instances in the series
          await Promise.all(
            createdEvents.map((evt) =>
              updateCalendarEvent(evt.id, userId, { description: note })
            )
          );
          for (const evt of createdEvents) {
            evt.description = note;
          }
        }
      } catch (err) {
        console.error("[AutoNote] Event note generation failed:", err);
      }
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

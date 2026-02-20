import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { parseBrainDump } from "@/lib/ai/parse-dump";
import {
  getUser,
  getUserGoals,
  getPendingTasks,
  getCalendarEventsByDateRange,
  getSavedLocations,
  createBrainDump,
  createTasksFromDump,
  createCalendarEventsFromDump,
} from "@/lib/db/queries";
import { expandRecurrence } from "@/lib/calendar/expand-recurrence";

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { transcript, mediaUrl } = body as {
      transcript: string;
      mediaUrl?: string;
    };

    if (!transcript?.trim()) {
      return NextResponse.json(
        { error: "Transcript is empty" },
        { status: 400 }
      );
    }

    // Get user timezone for accurate date parsing
    const user = await getUser(userId);
    const timezone = user?.timezone ?? "America/New_York";

    // Fetch context for anti-hallucination grounding
    const now = new Date();
    const todayStart = startOfDayInTz(now, timezone);
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    const [existingGoals, existingTasks, todayEvents, savedLocs] = await Promise.all([
      getUserGoals(userId),
      getPendingTasks(userId),
      getCalendarEventsByDateRange(userId, todayStart, todayEnd),
      getSavedLocations(userId),
    ]);

    const calendarSummary =
      todayEvents.length > 0
        ? todayEvents
            .map((e) => {
              const time = new Date(e.startTime).toLocaleTimeString("en-US", {
                timeZone: timezone,
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
              });
              return `${time}: ${e.title}`;
            })
            .join(", ")
        : undefined;

    // Parse with AI (voice-aware: filters filler speech)
    const result = await parseBrainDump(transcript, "voice", timezone, {
      existingGoals: existingGoals.map((g) => ({ title: g.title })),
      existingTasks: existingTasks.map((t) => ({ title: t.title })),
      calendarSummary,
      savedLocationNames: savedLocs.map((l) => l.name),
    });

    // Save brain dump record with voice metadata
    const dump = await createBrainDump({
      userId,
      inputType: "voice",
      rawContent: transcript,
      aiResponse: result,
      mediaUrl: mediaUrl ?? undefined,
    });

    // Create tasks from parsed output
    const createdTasks = await createTasksFromDump(
      userId,
      dump.id,
      result.tasks
    );

    // Create calendar events from parsed output
    let createdEventsCount = 0;
    if (result.events && result.events.length > 0) {
      const expandedEvents: Array<{
        title: string;
        description: string | null;
        startTime: Date;
        endTime: Date;
        location: string | null;
        isAllDay: boolean;
        seriesId: string | null;
      }> = [];

      for (const parsedEvent of result.events) {
        const instances = expandRecurrence(parsedEvent);
        const seriesId = instances.length > 1 ? crypto.randomUUID() : null;
        for (const instance of instances) {
          expandedEvents.push({ ...instance, seriesId });
        }
      }

      const created = await createCalendarEventsFromDump(
        userId,
        dump.id,
        expandedEvents
      );
      createdEventsCount = created.length;
    }

    return NextResponse.json({
      dump: {
        id: dump.id,
        summary: result.summary,
      },
      tasks: createdTasks,
      eventsCreated: createdEventsCount,
    });
  } catch (error) {
    console.error("[API] POST /api/dump/voice/parse error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to parse brain dump";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function startOfDayInTz(date: Date, timezone: string): Date {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((p) => p.type === "year")!.value;
  const month = parts.find((p) => p.type === "month")!.value;
  const day = parts.find((p) => p.type === "day")!.value;
  return new Date(`${year}-${month}-${day}T00:00:00`);
}

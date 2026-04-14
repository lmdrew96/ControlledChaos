import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { parseBrainDump } from "@/lib/ai/parse-dump";
import { AIUnavailableError } from "@/lib/ai";
import { startOfDayInTimezone } from "@/lib/timezone";
import {
  getUser,
  getUserSettings,
  getUserGoals,
  getPendingTasks,
  getCalendarEventsByDateRange,
  getSavedLocations,
  createBrainDump,
  createTasksFromDump,
  createCalendarEventsFromDump,
} from "@/lib/db/queries";
import type { PersonalityPrefs } from "@/types";
import { expandRecurrence } from "@/lib/calendar/expand-recurrence";

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { extractedText, mediaUrl } = body as {
      extractedText: string;
      mediaUrl?: string;
    };
    const category = body.category === "junk_journal" ? "junk_journal" : "braindump" as const;

    if (!extractedText?.trim()) {
      return NextResponse.json(
        { error: "Extracted text is empty" },
        { status: 400 }
      );
    }

    // Get user timezone for accurate date parsing
    const user = await getUser(userId);
    const timezone = user?.timezone ?? "America/New_York";

    // Fetch context for anti-hallucination grounding
    const now = new Date();
    const todayStart = startOfDayInTimezone(now, timezone);
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    const [existingGoals, existingTasks, todayEvents, savedLocs, settings] = await Promise.all([
      getUserGoals(userId),
      getPendingTasks(userId),
      getCalendarEventsByDateRange(userId, todayStart, todayEnd),
      getSavedLocations(userId),
      getUserSettings(userId),
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

    // Parse with AI (photo-aware: handles OCR artifacts)
    const result = await parseBrainDump(extractedText, "photo", timezone, {
      existingGoals: existingGoals.map((g) => ({ title: g.title })),
      existingTasks: existingTasks.map((t) => ({ title: t.title })),
      calendarSummary,
      savedLocationNames: savedLocs.map((l) => l.name),
      personalityPrefs: (settings?.personalityPrefs as PersonalityPrefs | null) ?? null,
    });

    // Save brain dump record with photo metadata
    const dump = await createBrainDump({
      userId,
      inputType: "photo",
      rawContent: extractedText,
      aiResponse: result,
      mediaUrl: mediaUrl ?? undefined,
      category,
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
    console.error("[API] POST /api/dump/photo/parse error:", error);
    if (error instanceof AIUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    const message =
      error instanceof Error ? error.message : "Failed to parse brain dump";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

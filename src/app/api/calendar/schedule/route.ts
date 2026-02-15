import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  getUser,
  getUserSettings,
  getPendingTasks,
  getCalendarEventsByDateRange,
  upsertCalendarEvent,
  updateTask,
} from "@/lib/db/queries";
import { generateSchedule } from "@/lib/ai/schedule";
import { writeEventToGoogle } from "@/lib/calendar/sync-google";
import type { EnergyProfile } from "@/types";

export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [user, settings, pendingTasks] = await Promise.all([
      getUser(userId),
      getUserSettings(userId),
      getPendingTasks(userId),
    ]);

    if (pendingTasks.length === 0) {
      return NextResponse.json({
        blocks: [],
        eventsCreated: 0,
        googleEventsCreated: 0,
        message: "No pending tasks to schedule.",
      });
    }

    const timezone = user?.timezone ?? "America/New_York";
    const scheduleDays = 3;

    // Get existing events for the scheduling window
    const now = new Date();
    const windowEnd = new Date(now);
    windowEnd.setDate(windowEnd.getDate() + scheduleDays);

    const existingEvents = await getCalendarEventsByDateRange(
      userId,
      now,
      windowEnd
    );

    // Serialize DB rows to CalendarEvent type (Date → string)
    const serializedEvents = existingEvents.map((e) => ({
      id: e.id,
      userId: e.userId,
      source: e.source as "canvas" | "google" | "controlledchaos",
      externalId: e.externalId,
      title: e.title,
      description: e.description,
      startTime: e.startTime.toISOString(),
      endTime: e.endTime.toISOString(),
      location: e.location,
      isAllDay: e.isAllDay ?? false,
      syncedAt: e.syncedAt.toISOString(),
    }));

    // Serialize tasks (Date → string)
    const serializedTasks = pendingTasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      energyLevel: t.energyLevel,
      estimatedMinutes: t.estimatedMinutes,
      category: t.category,
      locationTag: t.locationTag,
      deadline: t.deadline?.toISOString() ?? null,
      scheduledFor: t.scheduledFor?.toISOString() ?? null,
      completedAt: t.completedAt?.toISOString() ?? null,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    }));

    // Call AI scheduler
    const wakeTime = (settings?.wakeTime as number) ?? 7;
    const sleepTime = (settings?.sleepTime as number) ?? 22;

    const blocks = await generateSchedule({
      pendingTasks: serializedTasks,
      calendarEvents: serializedEvents,
      energyProfile: (settings?.energyProfile as EnergyProfile) ?? null,
      timezone,
      scheduleDays,
      wakeTime,
      sleepTime,
    });

    if (blocks.length === 0) {
      return NextResponse.json({
        blocks: [],
        eventsCreated: 0,
        googleEventsCreated: 0,
        message: "No free time blocks available or no tasks fit the schedule.",
      });
    }

    // Create calendar events for each scheduled block
    let eventsCreated = 0;
    let googleEventsCreated = 0;
    const createdBlocks = [];

    const taskMap = new Map(pendingTasks.map((t) => [t.id, t]));

    for (const block of blocks) {
      const task = taskMap.get(block.taskId);
      if (!task) continue;

      const eventTitle = `[CC] ${task.title}`;
      let googleEventId: string | null = null;

      // Write to Google Calendar if connected
      if (settings?.googleCalConnected) {
        googleEventId = await writeEventToGoogle(userId, {
          title: eventTitle,
          description: `Scheduled by ControlledChaos: ${block.reasoning}`,
          startTime: block.startTime,
          endTime: block.endTime,
          timezone,
        });
        if (googleEventId) googleEventsCreated++;
      }

      // Save to local DB
      await upsertCalendarEvent({
        userId,
        source: "controlledchaos",
        externalId: googleEventId ?? `cc-${task.id}-${block.startTime}`,
        title: eventTitle,
        description: block.reasoning,
        startTime: new Date(block.startTime),
        endTime: new Date(block.endTime),
        location: null,
        isAllDay: false,
      });

      // Update the task's scheduledFor
      await updateTask(task.id, userId, {
        scheduledFor: new Date(block.startTime),
      });

      eventsCreated++;
      createdBlocks.push({
        ...block,
        taskTitle: task.title,
      });
    }

    return NextResponse.json({
      blocks: createdBlocks,
      eventsCreated,
      googleEventsCreated,
      message: `Scheduled ${eventsCreated} task${eventsCreated !== 1 ? "s" : ""}${
        googleEventsCreated > 0
          ? ` (${googleEventsCreated} synced to Google Calendar)`
          : ""
      }.`,
    });
  } catch (error) {
    console.error("[API] POST /api/calendar/schedule error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to schedule tasks";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

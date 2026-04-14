import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { AIUnavailableError } from "@/lib/ai";
import {
  getUser,
  getUserSettings,
  getCalendarEventsByDateRange,
  upsertCalendarEvent,
  updateTask,
} from "@/lib/db/queries";
import { db } from "@/lib/db";
import { tasks } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { scheduleOneTask } from "@/lib/ai/schedule";
import { syncCanvasCalendar } from "@/lib/calendar/sync-canvas";
import type { EnergyProfile, PersonalityPrefs } from "@/types";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_req: Request, context: RouteContext) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;

    // Fetch the task (verify ownership)
    const [task] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
      .limit(1);

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const [user, settings] = await Promise.all([
      getUser(userId),
      getUserSettings(userId),
    ]);

    const timezone = user?.timezone ?? "America/New_York";
    const wakeTime = (settings?.wakeTime as number) ?? 7;
    const sleepTime = (settings?.sleepTime as number) ?? 22;

    // Sync Canvas before scheduling so we have the latest events
    if (settings?.canvasIcalUrl) {
      await syncCanvasCalendar(userId, settings.canvasIcalUrl, timezone).catch((err) =>
        console.error("[ScheduleTask] Canvas pre-sync failed:", err)
      );
    }

    // Get 3-day calendar window
    const now = new Date();
    const windowEnd = new Date(now);
    windowEnd.setDate(windowEnd.getDate() + 3);

    const existingEvents = await getCalendarEventsByDateRange(userId, now, windowEnd);

    const serializedEvents = existingEvents.map((e) => ({
      id: e.id,
      userId: e.userId,
      source: e.source as "canvas" | "controlledchaos",
      externalId: e.externalId,
      title: e.title,
      description: e.description,
      startTime: e.startTime.toISOString(),
      endTime: e.endTime.toISOString(),
      location: e.location,
      category: (e.category as "school" | "work" | "personal" | "errands" | "health") ?? null,
      isAllDay: e.isAllDay ?? false,
      seriesId: e.seriesId ?? null,
      sourceDumpId: e.sourceDumpId ?? null,
      syncedAt: e.syncedAt.toISOString(),
    }));

    const serializedTask = {
      id: task.id,
      userId: task.userId,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      energyLevel: task.energyLevel,
      estimatedMinutes: task.estimatedMinutes,
      category: task.category,
      locationTags: task.locationTags,
      deadline: task.deadline?.toISOString() ?? null,
      scheduledFor: task.scheduledFor?.toISOString() ?? null,
      completedAt: task.completedAt?.toISOString() ?? null,
      parentTaskId: task.parentTaskId ?? null,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    };

    const block = await scheduleOneTask({
      task: serializedTask,
      calendarEvents: serializedEvents,
      energyProfile: (settings?.energyProfile as EnergyProfile) ?? null,
      timezone,
      wakeTime,
      sleepTime,
      personalityPrefs: (settings?.personalityPrefs as PersonalityPrefs | null) ?? null,
    });

    if (!block) {
      return NextResponse.json({
        block: null,
        message: "No free time found in the next 3 days.",
      });
    }

    // Create calendar event
    await upsertCalendarEvent({
      userId,
      source: "controlledchaos",
      externalId: `cc-${task.id}-${block.startTime}`,
      title: task.title,
      description: block.reasoning,
      startTime: new Date(block.startTime),
      endTime: new Date(block.endTime),
      location: null,
      isAllDay: false,
    });

    // Update task.scheduledFor
    await updateTask(task.id, userId, {
      scheduledFor: new Date(block.startTime),
    });

    return NextResponse.json({
      block: { ...block, taskTitle: task.title },
      scheduledFor: block.startTime,
      message: "Task scheduled.",
    });
  } catch (error) {
    console.error("[API] POST /api/tasks/[id]/schedule error:", error);
    if (error instanceof AIUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    const message =
      error instanceof Error ? error.message : "Failed to schedule task";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

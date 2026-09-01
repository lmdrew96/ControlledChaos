import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { AIUnavailableError } from "@/lib/ai";
import { scheduleOneTask } from "@/lib/ai/schedule";
import { buildPlanningContext } from "@/lib/plan/context";
import { planBlockMinutes } from "@/lib/calendar/plan-blocks";
import type { CalendarEvent } from "@/types";

/**
 * POST /api/plan/retry
 *
 * Re-proposes a time for ONE task, leaving every other row's decision intact.
 * Body: { taskId, takenSlots?: [{ startTime, endTime }] }
 *
 * `takenSlots` are the blocks the user has already accepted in this review
 * session but not yet committed. They aren't in the database, so without them
 * a retry would happily propose a slot the user just claimed.
 */
export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const taskId = body?.taskId;
    if (typeof taskId !== "string") {
      return NextResponse.json({ error: "taskId is required" }, { status: 400 });
    }

    const ctx = await buildPlanningContext(userId);

    if (!ctx.window) {
      return NextResponse.json({
        block: null,
        reason: "day_over",
        message: "Today's already wrapped up.",
      });
    }

    const task = ctx.schedulableTasks.find((t) => t.id === taskId);
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Fold the user's in-flight accepted rows into the busy set.
    const pending: CalendarEvent[] = (
      Array.isArray(body?.takenSlots) ? body.takenSlots : []
    )
      .filter(
        (s: { startTime?: unknown; endTime?: unknown }) =>
          typeof s?.startTime === "string" && typeof s?.endTime === "string"
      )
      .map((s: { startTime: string; endTime: string }, i: number) => ({
        id: `pending-${i}`,
        userId: "",
        source: "controlledchaos" as const,
        externalId: `pending-${i}`,
        title: "Accepted block",
        description: null,
        startTime: s.startTime,
        endTime: s.endTime,
        location: null,
        category: null,
        isAllDay: false,
        seriesId: null,
        sourceDumpId: null,
        syncedAt: s.startTime,
      }));

    const block = await scheduleOneTask({
      task,
      calendarEvents: [...ctx.busyIntervals, ...pending],
      currentEnergy: ctx.currentEnergy,
      timezone: ctx.timezone,
      wakeTime: ctx.wakeHour,
      sleepTime: ctx.sleepHour,
      personalityPrefs: ctx.personalityPrefs,
      aiContextBlock: ctx.aiContextBlock,
      // Retry stays inside today, same as the plan it belongs to.
      scheduleDays: 1,
    });

    if (!block) {
      return NextResponse.json({
        block: null,
        reason: "no_room",
        message: "No other opening today that fits this one.",
      });
    }

    return NextResponse.json({
      block: {
        taskId: task.id,
        taskTitle: task.title,
        startTime: block.startTime,
        endTime: block.endTime,
        minutes: planBlockMinutes(task.estimatedMinutes),
        reasoning: block.reasoning,
      },
      reason: "ok",
    });
  } catch (error) {
    console.error("[API] POST /api/plan/retry error:", error);
    if (error instanceof AIUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: "Failed to find another time" },
      { status: 500 }
    );
  }
}

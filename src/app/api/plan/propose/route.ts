import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { AIUnavailableError } from "@/lib/ai";
import { generateSchedule } from "@/lib/ai/schedule";
import { buildPlanningContext } from "@/lib/plan/context";
import { planBlockMinutes } from "@/lib/calendar/plan-blocks";

/**
 * POST /api/plan/propose
 *
 * Proposes today's plan. Writes NOTHING — the user reviews the blocks and
 * commits the ones they want via /api/plan/commit. Only Canvas sync and brain
 * dump write without asking; those import things that already exist, whereas
 * this invents placements.
 */
export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ctx = await buildPlanningContext(userId);

    if (!ctx.window) {
      return NextResponse.json({
        blocks: [],
        reason: "day_over",
        message: "Today's already wrapped up. Nothing left to plan.",
      });
    }

    if (ctx.schedulableTasks.length === 0) {
      return NextResponse.json({
        blocks: [],
        reason: "no_tasks",
        message: "Nothing waiting to be planned right now.",
      });
    }

    const blocks = await generateSchedule({
      pendingTasks: ctx.schedulableTasks,
      calendarEvents: ctx.busyIntervals,
      currentEnergy: ctx.currentEnergy,
      timezone: ctx.timezone,
      scheduleDays: 1,
      wakeTime: ctx.wakeHour,
      sleepTime: ctx.sleepHour,
      personalityPrefs: ctx.personalityPrefs,
      aiContextBlock: ctx.aiContextBlock,
    });

    if (blocks.length === 0) {
      return NextResponse.json({
        blocks: [],
        reason: "no_room",
        message: "No open stretches left today that fit these tasks.",
      });
    }

    const taskById = new Map(ctx.schedulableTasks.map((t) => [t.id, t]));

    const proposals = blocks.flatMap((b) => {
      const task = taskById.get(b.taskId);
      if (!task) return [];
      return [
        {
          taskId: task.id,
          taskTitle: task.title,
          startTime: b.startTime,
          endTime: b.endTime,
          minutes: planBlockMinutes(task.estimatedMinutes),
          reasoning: b.reasoning,
        },
      ];
    });

    return NextResponse.json({
      blocks: proposals,
      reason: "ok",
      message: `${proposals.length} block${proposals.length === 1 ? "" : "s"} proposed.`,
    });
  } catch (error) {
    console.error("[API] POST /api/plan/propose error:", error);
    if (error instanceof AIUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    const message =
      error instanceof Error ? error.message : "Failed to propose a plan";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getCrisisPlan } from "@/lib/ai/crisis";
import { AIUnavailableError } from "@/lib/ai";
import {
  getUserSettings,
  getCalendarEventsByDateRange,
  getPendingTasks,
  createCrisisPlan,
  getActiveCrisisPlan,
  getCrisisPlanById,
  updateCrisisPlanProgress,
  completeCrisisPlan,
} from "@/lib/db/queries";
import { getUser } from "@/lib/db/queries";
import type { CrisisFileAttachment } from "@/types";

// GET — check for an active (in-progress) crisis plan
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const plan = await getActiveCrisisPlan(userId);
    return NextResponse.json({ plan });
  } catch (error) {
    console.error("[API] GET /api/crisis error:", error);
    return NextResponse.json({ error: "Failed to fetch plan" }, { status: 500 });
  }
}

// POST — generate and persist a new crisis plan
export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      taskName,
      deadline,
      completionPct,
      files,
    } = body as {
      taskName: string;
      deadline: string;
      completionPct: number;
      files?: CrisisFileAttachment[];
    };

    if (!taskName?.trim()) {
      return NextResponse.json({ error: "taskName is required" }, { status: 400 });
    }
    if (!deadline) {
      return NextResponse.json({ error: "deadline is required" }, { status: 400 });
    }

    const now = new Date();
    const deadlineDate = new Date(deadline);
    if (isNaN(deadlineDate.getTime())) {
      return NextResponse.json({ error: "Invalid deadline date" }, { status: 400 });
    }

    const [user, settings, upcomingEvents, pendingTasks] = await Promise.all([
      getUser(userId),
      getUserSettings(userId),
      getCalendarEventsByDateRange(userId, now, deadlineDate),
      getPendingTasks(userId),
    ]);

    const timezone = user?.timezone ?? "America/New_York";
    const minutesUntilDeadline = Math.max(
      0,
      Math.round((deadlineDate.getTime() - now.getTime()) / 60000)
    );

    const currentTime = now.toLocaleString("en-US", {
      timeZone: timezone,
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    const plan = await getCrisisPlan({
      taskName,
      deadline: deadlineDate.toLocaleString("en-US", {
        timeZone: timezone,
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }),
      completionPct,
      currentTime,
      minutesUntilDeadline,
      upcomingEvents: upcomingEvents.map((e) => ({
        title: e.title,
        startTime: e.startTime.toISOString(),
        endTime: e.endTime.toISOString(),
      })),
      existingPendingTaskCount: pendingTasks.length,
      files,
    });

    const saved = await createCrisisPlan({
      userId,
      taskName,
      deadline: deadlineDate,
      completionPct,
      panicLevel: plan.panicLevel,
      panicLabel: plan.panicLabel,
      summary: plan.summary,
      tasks: plan.tasks,
    });

    return NextResponse.json({
      id: saved.id,
      plan: {
        panicLevel: saved.panicLevel,
        panicLabel: saved.panicLabel,
        summary: saved.summary,
        tasks: saved.tasks,
        currentTaskIndex: saved.currentTaskIndex,
      },
    });
  } catch (error) {
    console.error("[API] POST /api/crisis error:", error);
    if (error instanceof AIUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    const message =
      error instanceof Error ? error.message : "Failed to generate crisis plan";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PATCH — update progress or mark complete
export async function PATCH(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      planId,
      currentTaskIndex,
      completed,
    } = body as {
      planId: string;
      currentTaskIndex?: number;
      completed?: boolean;
    };

    if (!planId) {
      return NextResponse.json({ error: "planId is required" }, { status: 400 });
    }

    // Ownership check
    const plan = await getCrisisPlanById(planId, userId);
    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    if (completed) {
      const updated = await completeCrisisPlan(planId);
      return NextResponse.json({ plan: updated });
    }

    if (currentTaskIndex !== undefined) {
      const updated = await updateCrisisPlanProgress(planId, currentTaskIndex);
      return NextResponse.json({ plan: updated });
    }

    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  } catch (error) {
    console.error("[API] PATCH /api/crisis error:", error);
    return NextResponse.json({ error: "Failed to update plan" }, { status: 500 });
  }
}

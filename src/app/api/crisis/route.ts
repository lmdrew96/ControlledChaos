import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getCrisisPlan } from "@/lib/ai/crisis";
import { AIUnavailableError } from "@/lib/ai";
import {
  getUserSettings,
  getCalendarEventsByDateRange,
  getPendingTasks,
  createCrisisPlan,
  getActiveCrisisPlans,
  getCrisisPlanById,
  updateCrisisPlanProgress,
  completeCrisisPlan,
  getUserLocation,
  getCommuteTimes,
  getSavedLocations,
} from "@/lib/db/queries";
import { getUser } from "@/lib/db/queries";
import { db } from "@/lib/db";
import { crisisPlans } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import type { CrisisFileAttachment, CrisisPlan, CrisisTask } from "@/types";
import {
  formatForDisplay,
  DISPLAY_DATETIME,
  DISPLAY_FULL_DATETIME,
  getHourInTimezone,
  startOfDayInTimezone,
  getCalendarParts,
} from "@/lib/timezone";

function formatEventsForAI(
  events: Array<{ title: string; startTime: Date; endTime: Date }>,
  timezone: string
) {
  return events.map((e) => ({
    title: e.title,
    startTime: formatForDisplay(e.startTime, timezone, DISPLAY_DATETIME),
    endTime: formatForDisplay(e.endTime, timezone, DISPLAY_DATETIME),
    durationMinutes: Math.round((e.endTime.getTime() - e.startTime.getTime()) / 60_000),
  }));
}

/**
 * Build commute context: for the user's current location, list travel
 * times to all other saved locations.
 */
function buildCommuteContext(
  userLocation: { matchedLocationId: string | null } | null,
  allCommutes: Array<{ fromLocationId: string; toLocationId: string; travelMinutes: number }>,
  savedLocations: Array<{ id: string; name: string }>
): Array<{ to: string; minutes: number }> {
  if (!userLocation?.matchedLocationId || allCommutes.length === 0) return [];

  const fromId = userLocation.matchedLocationId;
  const locationNameMap = new Map(savedLocations.map((l) => [l.id, l.name]));

  return allCommutes
    .filter((c) => c.fromLocationId === fromId)
    .map((c) => ({
      to: locationNameMap.get(c.toLocationId) ?? "Unknown",
      minutes: c.travelMinutes,
    }));
}

/**
 * Calculate total minutes of sleep blocked between `start` and `end`,
 * given the user's sleep window (sleepTime → wakeTime in their timezone).
 * E.g., sleepTime=22, wakeTime=7 means 10 PM–7 AM = 9 hours of sleep per night.
 */
function getSleepMinutesBlocked(
  start: Date,
  end: Date,
  sleepTime: number,
  wakeTime: number,
  timezone: string
): number {
  // Get the user's current local hour
  const localHour = getHourInTimezone(start, timezone);

  // Calculate sleep duration per night in minutes
  const sleepDurationMin =
    sleepTime > wakeTime
      ? (24 - sleepTime + wakeTime) * 60 // Overnight: e.g., 22→7 = 9h
      : (wakeTime - sleepTime) * 60;      // Same-day (unusual): e.g., 2→9 = 7h

  const totalMinutes = (end.getTime() - start.getTime()) / 60_000;
  if (totalMinutes <= 0) return 0;

  // Walk through each night's sleep window between start and end
  // Use a simple approach: count how many full sleep periods fit
  let blocked = 0;
  const cursor = new Date(start);

  // Find the next sleep start time in the user's timezone
  const getNextSleepStart = (from: Date): Date => {
    const currentH = getHourInTimezone(from, timezone);

    // If we haven't passed sleep time today, sleep starts today
    // If we have, sleep starts tomorrow
    const targetDate = currentH < sleepTime
      ? from
      : new Date(from.getTime() + 86_400_000);
    const midnight = startOfDayInTimezone(targetDate, timezone);
    return new Date(midnight.getTime() + sleepTime * 3_600_000);
  };

  // Check if we're currently IN a sleep window
  const isInSleep = sleepTime > wakeTime
    ? (localHour >= sleepTime || localHour < wakeTime)
    : (localHour >= sleepTime && localHour < wakeTime);

  if (isInSleep) {
    // We're in sleep now — calculate remaining sleep minutes
    const minutesToWake = wakeTime > localHour
      ? (wakeTime - localHour) * 60
      : (24 - localHour + wakeTime) * 60;
    const sleepEnd = new Date(start.getTime() + minutesToWake * 60_000);
    const effectiveEnd = sleepEnd < end ? sleepEnd : end;
    blocked += (effectiveEnd.getTime() - start.getTime()) / 60_000;
    cursor.setTime(effectiveEnd.getTime());
  }

  // Walk through remaining nights
  for (let i = 0; i < 10; i++) { // max 10 nights safety
    const sleepStart = getNextSleepStart(cursor);
    if (sleepStart >= end) break;
    const sleepEnd = new Date(sleepStart.getTime() + sleepDurationMin * 60_000);
    const effectiveEnd = sleepEnd < end ? sleepEnd : end;
    blocked += (effectiveEnd.getTime() - sleepStart.getTime()) / 60_000;
    cursor.setTime(sleepEnd.getTime());
  }

  return Math.round(blocked);
}

// GET — return all active (in-progress) crisis plans
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const plans = await getActiveCrisisPlans(userId);
    return NextResponse.json({ plans });
  } catch (error) {
    console.error("[API] GET /api/crisis error:", error);
    return NextResponse.json({ error: "Failed to fetch plans" }, { status: 500 });
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
      selectedPlan,
    } = body as {
      taskName: string;
      deadline: string;
      completionPct: number;
      files?: CrisisFileAttachment[];
      selectedPlan?: CrisisPlan;
    };

    if (!taskName?.trim()) {
      return NextResponse.json({ error: "taskName is required" }, { status: 400 });
    }
    if (!deadline) {
      return NextResponse.json({ error: "deadline is required" }, { status: 400 });
    }

    // If the user selected a strategy from a previous multi-strategy response,
    // persist it directly without calling AI again.
    if (selectedPlan) {
      const deadlineDate = new Date(deadline);
      const saved = await createCrisisPlan({
        userId,
        taskName,
        deadline: deadlineDate,
        completionPct,
        panicLevel: selectedPlan.panicLevel,
        panicLabel: selectedPlan.panicLabel,
        summary: selectedPlan.summary,
        tasks: selectedPlan.tasks,
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
    }

    const now = new Date();
    const deadlineDate = new Date(deadline);
    if (isNaN(deadlineDate.getTime())) {
      return NextResponse.json({ error: "Invalid deadline date" }, { status: 400 });
    }

    const [user, settings, upcomingEvents, pendingTasks, existingCrises, userLocation, allCommutes] = await Promise.all([
      getUser(userId),
      getUserSettings(userId),
      getCalendarEventsByDateRange(userId, now, deadlineDate),
      getPendingTasks(userId),
      getActiveCrisisPlans(userId),
      getUserLocation(userId),
      getCommuteTimes(userId),
    ]);

    const timezone = user?.timezone ?? "America/New_York";
    const wakeTime = (settings?.wakeTime as number) ?? 7;
    const sleepTime = (settings?.sleepTime as number) ?? 22;
    const minutesUntilDeadline = Math.max(
      0,
      Math.round((deadlineDate.getTime() - now.getTime()) / 60000)
    );
    const sleepMinutesBlocked = getSleepMinutesBlocked(now, deadlineDate, sleepTime, wakeTime, timezone);

    const currentTime = formatForDisplay(now, timezone, DISPLAY_FULL_DATETIME);

    // Build commute context from user's current location
    const commuteContext = buildCommuteContext(userLocation, allCommutes, await getSavedLocations(userId));

    const result = await getCrisisPlan({
      taskName,
      deadline: formatForDisplay(deadlineDate, timezone, DISPLAY_DATETIME),
      completionPct,
      currentTime,
      minutesUntilDeadline,
      sleepSchedule: { wakeTime, sleepTime, sleepMinutesBlocked },
      upcomingEvents: formatEventsForAI(upcomingEvents, timezone),
      existingPendingTaskCount: pendingTasks.length,
      activeCrises: existingCrises.map((c) => ({
        taskName: c.taskName,
        deadline: formatForDisplay(new Date(c.deadline), timezone, DISPLAY_DATETIME),
        panicLevel: c.panicLevel,
        progressPct: Math.round((c.currentTaskIndex / (c.tasks as unknown[]).length) * 100),
      })),
      currentLocation: userLocation?.matchedLocationName ?? null,
      commuteContext,
      files,
    });

    // Multi-strategy response — return strategies for user to pick from
    if (result.type === "strategies") {
      return NextResponse.json({
        strategies: result.strategies,
        // Pass through context the frontend needs to persist after selection
        _context: { taskName, deadline: deadlineDate.toISOString(), completionPct },
      });
    }

    const plan = result.plan;
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

// PUT — reassess an existing crisis plan with fresh AI analysis
export async function PUT(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { planId } = body as { planId: string };
    if (!planId) {
      return NextResponse.json({ error: "planId is required" }, { status: 400 });
    }

    const plan = await getCrisisPlanById(planId, userId);
    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    const now = new Date();
    const deadlineDate = new Date(plan.deadline);
    const minutesUntilDeadline = Math.max(
      0,
      Math.round((deadlineDate.getTime() - now.getTime()) / 60000)
    );

    const [user, settings, upcomingEvents, pendingTasks, existingCrises, userLocation, allCommutes, savedLocs] = await Promise.all([
      getUser(userId),
      getUserSettings(userId),
      getCalendarEventsByDateRange(userId, now, deadlineDate),
      getPendingTasks(userId),
      getActiveCrisisPlans(userId),
      getUserLocation(userId),
      getCommuteTimes(userId),
      getSavedLocations(userId),
    ]);

    const timezone = user?.timezone ?? "America/New_York";
    const wakeTime = (settings?.wakeTime as number) ?? 7;
    const sleepTime = (settings?.sleepTime as number) ?? 22;
    const sleepMinutesBlocked = getSleepMinutesBlocked(now, deadlineDate, sleepTime, wakeTime, timezone);

    // Calculate current progress based on task index
    const totalTasks = (plan.tasks as unknown[]).length;
    const currentProgress = Math.round(
      ((plan.currentTaskIndex ?? 0) / totalTasks) * 100
    );
    // Use the higher of original completion + progress through tasks
    const effectiveCompletion = Math.max(plan.completionPct, currentProgress);

    const currentTime = formatForDisplay(now, timezone, DISPLAY_FULL_DATETIME);

    const otherCrises = existingCrises.filter((c) => c.id !== planId);
    const commuteContext = buildCommuteContext(userLocation, allCommutes, savedLocs);

    // Preserve completed steps — only regenerate remaining work
    const existingTasks = plan.tasks as CrisisTask[];
    const taskIndex = plan.currentTaskIndex ?? 0;
    const completedTasks = existingTasks.slice(0, taskIndex);
    const completedStepTitles = completedTasks.map((t) => t.title);

    const result = await getCrisisPlan({
      taskName: plan.taskName,
      deadline: formatForDisplay(deadlineDate, timezone, DISPLAY_DATETIME),
      completionPct: effectiveCompletion,
      currentTime,
      minutesUntilDeadline,
      sleepSchedule: { wakeTime, sleepTime, sleepMinutesBlocked },
      upcomingEvents: formatEventsForAI(upcomingEvents, timezone),
      existingPendingTaskCount: pendingTasks.length,
      activeCrises: otherCrises.map((c) => ({
        taskName: c.taskName,
        deadline: formatForDisplay(new Date(c.deadline), timezone, DISPLAY_DATETIME),
        panicLevel: c.panicLevel,
        progressPct: Math.round(((c.currentTaskIndex ?? 0) / (c.tasks as unknown[]).length) * 100),
      })),
      completedSteps: completedStepTitles,
      currentLocation: userLocation?.matchedLocationName ?? null,
      commuteContext,
    });

    // Reassess always uses a single plan — if AI returned strategies, pick the first one
    const newPlan: CrisisPlan =
      result.type === "strategies"
        ? result.strategies[0].plan
        : result.plan;

    // Merge: completed tasks stay, AI-generated tasks replace the remaining ones
    const mergedTasks = [...completedTasks, ...newPlan.tasks];

    const [updated] = await db
      .update(crisisPlans)
      .set({
        panicLevel: newPlan.panicLevel,
        panicLabel: newPlan.panicLabel,
        summary: newPlan.summary,
        tasks: mergedTasks,
        currentTaskIndex: taskIndex,
        updatedAt: new Date(),
      })
      .where(and(eq(crisisPlans.id, planId), eq(crisisPlans.userId, userId)))
      .returning();

    return NextResponse.json({
      plan: {
        panicLevel: updated.panicLevel,
        panicLabel: updated.panicLabel,
        summary: updated.summary,
        tasks: updated.tasks,
        currentTaskIndex: updated.currentTaskIndex,
      },
    });
  } catch (error) {
    console.error("[API] PUT /api/crisis error:", error);
    if (error instanceof AIUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    return NextResponse.json({ error: "Failed to reassess plan" }, { status: 500 });
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
// DELETE — abandon (soft-complete) a crisis plan so it no longer shows as active
export async function DELETE(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const planId = searchParams.get("planId");
    if (!planId) {
      return NextResponse.json({ error: "planId is required" }, { status: 400 });
    }

    const plan = await getCrisisPlanById(planId, userId);
    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    // Mark as completed (abandoned) — use completedAt to remove from active list
    await db
      .update(crisisPlans)
      .set({ completedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(crisisPlans.id, planId), eq(crisisPlans.userId, userId)));

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[API] DELETE /api/crisis error:", error);
    return NextResponse.json({ error: "Failed to abandon plan" }, { status: 500 });
  }
}

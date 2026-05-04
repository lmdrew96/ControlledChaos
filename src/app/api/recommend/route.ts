import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getTaskRecommendation } from "@/lib/ai/recommend";
import { AIUnavailableError } from "@/lib/ai";
import { buildAIContext } from "@/lib/ai/context";
import {
  getUser,
  getUserSettings,
  getPendingTasks,
  getCurrentCalendarEvent,
  getNextCalendarEvent,
  getCalendarEventsByDateRange,
  getTasksCompletedToday,
  getRecentTaskActivity,
  getSavedLocations,
  logTaskActivity,
} from "@/lib/db/queries";
import { syncCanvasCalendar } from "@/lib/calendar/sync-canvas";
import { startOfDayInTimezone } from "@/lib/timezone";
import { getCurrentEnergy } from "@/lib/context/energy";
import { getRecentMoment } from "@/lib/db/queries";
import { matchLocation } from "@/lib/context/location";
import type { UserContext, EnergyLevel, MomentType, PersonalityPrefs } from "@/types";

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { latitude, longitude, energyOverride } = body as {
      latitude?: number;
      longitude?: number;
      energyOverride?: EnergyLevel;
    };

    // Always sync calendar before reasoning so the AI sees the latest data
    const settings = await getUserSettings(userId);

    if (settings) {
      const syncPromises: Promise<unknown>[] = [];
      if (settings.canvasIcalUrl) {
        const timezone = (await getUser(userId))?.timezone ?? "America/New_York";
        syncPromises.push(
          syncCanvasCalendar(userId, settings.canvasIcalUrl, timezone).catch((err) =>
            console.error("[Recommend] Canvas sync failed:", err)
          )
        );
      }
      if (syncPromises.length > 0) {
        await Promise.all(syncPromises);
      }
    }

    // Fetch user first so we can compute timezone-aware date boundaries
    const user = await getUser(userId);
    const timezone = user?.timezone ?? "America/New_York";

    const now = new Date();
    const endOfTomorrow = new Date(startOfDayInTimezone(now, timezone).getTime() + 2 * 86_400_000 - 1);

    const [pendingTasks, currentEvent, nextEvent, upcomingEvents, recentActivity, aiCtx] =
      await Promise.all([
        getPendingTasks(userId),
        getCurrentCalendarEvent(userId),
        getNextCalendarEvent(userId),
        getCalendarEventsByDateRange(userId, now, endOfTomorrow),
        getRecentTaskActivity(userId, 10),
        buildAIContext(userId, { skipCalendar: true }), // calendar fetched separately with broader range
      ]);

    if (pendingTasks.length === 0) {
      return NextResponse.json({
        recommendation: null,
        message: "No pending tasks. Time for a brain dump!",
      });
    }

    // Get completed today count (needs timezone, so separate call)
    const completedToday = await getTasksCompletedToday(userId, timezone);

    // Match location if coordinates provided
    let locationContext: UserContext["location"] | undefined;
    if (latitude != null && longitude != null) {
      const savedLocations = await getSavedLocations(userId);
      const match = matchLocation(
        { latitude, longitude },
        savedLocations
      );
      if (match) {
        locationContext = {
          name: match.name,
          latitude: match.latitude,
          longitude: match.longitude,
        };
      }
    }

    // Determine energy level + most recent Moment (for AI prompt context)
    const [energyLevel, recentMomentRow] = await Promise.all([
      getCurrentEnergy(userId, timezone, energyOverride),
      getRecentMoment(userId, 120),
    ]);
    const recentMoment = recentMomentRow
      ? {
          type: recentMomentRow.type as MomentType,
          intensity: recentMomentRow.intensity,
          note: recentMomentRow.note,
          minutesAgo: Math.max(
            0,
            Math.round((Date.now() - recentMomentRow.occurredAt.getTime()) / 60000)
          ),
        }
      : null;

    // Minutes until current event ends (if in one right now)
    const minutesUntilFree = currentEvent
      ? Math.max(
          0,
          Math.round(
            (new Date(currentEvent.endTime).getTime() - Date.now()) / 60000
          )
        )
      : undefined;

    // Minutes until next event
    const minutesUntil = nextEvent
      ? Math.max(
          0,
          Math.round(
            (new Date(nextEvent.startTime).getTime() - Date.now()) / 60000
          )
        )
      : undefined;

    // Recently rejected/snoozed task IDs
    const recentlyRejectedIds = recentActivity
      .filter((a) => a.action === "rejected" || a.action === "snoozed")
      .map((a) => a.taskId);

    // Format current time in user's timezone so the AI sees the correct local time
    const localTime = now.toLocaleString("en-US", {
      timeZone: timezone,
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    // Build context
    const context: UserContext = {
      currentTime: localTime,
      timezone,
      location: locationContext,
      currentEvent: currentEvent
        ? {
            title: currentEvent.title,
            endTime: currentEvent.endTime.toISOString(),
            minutesUntilFree: minutesUntilFree!,
          }
        : undefined,
      nextEvent: nextEvent
        ? {
            title: nextEvent.title,
            startTime: nextEvent.startTime.toISOString(),
            minutesUntil: minutesUntil!,
          }
        : undefined,
      upcomingEvents: upcomingEvents.map((e) => ({
        title: e.title,
        startTime: e.startTime.toISOString(),
        endTime: e.endTime.toISOString(),
        source: e.source,
      })),
      energyLevel,
      recentMoment,
      recentActivity: {
        tasksCompletedToday: completedToday.length,
        lastAction: recentActivity[0]?.action,
        lastActionTime: recentActivity[0]?.createdAt?.toISOString(),
      },
    };

    // Serialize tasks for AI (convert Date fields to strings)
    const serializedTasks = pendingTasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      energyLevel: t.energyLevel,
      estimatedMinutes: t.estimatedMinutes,
      category: t.category,
      locationTags: t.locationTags,
      deadline: t.deadline?.toISOString() ?? null,
      scheduledFor: t.scheduledFor?.toISOString() ?? null,
      completedAt: t.completedAt?.toISOString() ?? null,
      parentTaskId: t.parentTaskId ?? null,
      sourceDumpId: t.sourceDumpId ?? null,
      sourceEventId: t.sourceEventId ?? null,
      goalId: t.goalId ?? null,
      progressSteps: (t.progressSteps as import("@/types").ProgressStep[] | null) ?? null,
      currentStepIndex: t.currentStepIndex ?? 0,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    }));

    const recommendation = await getTaskRecommendation({
      context,
      pendingTasks: serializedTasks,
      recentlyRejectedTaskIds: recentlyRejectedIds,
      personalityPrefs: (settings?.personalityPrefs as PersonalityPrefs | null) ?? null,
      aiContextBlock: aiCtx.formatted,
    });

    // Log the recommendation
    await logTaskActivity({
      userId,
      taskId: recommendation.taskId,
      action: "recommended",
      context: {
        energy: energyLevel,
        location: locationContext?.name ?? null,
        time_of_day: context.currentTime,
        time_available: minutesUntil ?? null,
      },
    });

    // Attach full task data for the UI
    const recommendedTask = serializedTasks.find(
      (t) => t.id === recommendation.taskId
    );
    const alternativeTasks = recommendation.alternatives.map((alt) => ({
      ...alt,
      task: serializedTasks.find((t) => t.id === alt.taskId) ?? null,
    }));

    return NextResponse.json({
      recommendation: {
        ...recommendation,
        task: recommendedTask,
        alternatives: alternativeTasks,
      },
      context: {
        energyLevel,
        location: locationContext?.name ?? null,
        minutesUntilNextEvent: minutesUntil ?? null,
        pendingTaskCount: pendingTasks.length,
      },
    });
  } catch (error) {
    console.error("[API] POST /api/recommend error:", error);
    if (error instanceof AIUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    const message =
      error instanceof Error ? error.message : "Failed to get recommendation";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

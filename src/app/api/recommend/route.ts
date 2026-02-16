import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getTaskRecommendation } from "@/lib/ai/recommend";
import {
  getUser,
  getUserSettings,
  getPendingTasks,
  getNextCalendarEvent,
  getTasksCompletedToday,
  getRecentTaskActivity,
  getSavedLocations,
  logTaskActivity,
} from "@/lib/db/queries";
import { getCurrentEnergy } from "@/lib/context/energy";
import { matchLocation } from "@/lib/context/location";
import type { UserContext, EnergyLevel, EnergyProfile } from "@/types";

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

    // Gather all context in parallel
    const [user, settings, pendingTasks, nextEvent, recentActivity] =
      await Promise.all([
        getUser(userId),
        getUserSettings(userId),
        getPendingTasks(userId),
        getNextCalendarEvent(userId),
        getRecentTaskActivity(userId, 10),
      ]);

    if (pendingTasks.length === 0) {
      return NextResponse.json({
        recommendation: null,
        message: "No pending tasks. Time for a brain dump!",
      });
    }

    const timezone = user?.timezone ?? "America/New_York";

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

    // Determine energy level
    const energyLevel = getCurrentEnergy(
      (settings?.energyProfile as EnergyProfile) ?? null,
      timezone,
      energyOverride
    );

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
    const now = new Date();
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
      nextEvent: nextEvent
        ? {
            title: nextEvent.title,
            startTime: nextEvent.startTime.toISOString(),
            minutesUntil: minutesUntil!,
          }
        : undefined,
      energyLevel,
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
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    }));

    const recommendation = await getTaskRecommendation({
      context,
      pendingTasks: serializedTasks,
      recentlyRejectedTaskIds: recentlyRejectedIds,
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
    const message =
      error instanceof Error ? error.message : "Failed to get recommendation";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

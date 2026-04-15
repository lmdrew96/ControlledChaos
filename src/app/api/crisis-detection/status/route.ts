import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  getCrisisDetectionTier,
  getActiveDetectionForUser,
  getTasksByUser,
  getCalendarEventsByDateRange,
  getUserSettings,
  getUser,
} from "@/lib/db/queries";
import { detectCrisis } from "@/lib/crisis-detection";
import type { CrisisDetectionStatus } from "@/types";

/**
 * GET /api/crisis-detection/status
 *
 * Returns the current crisis detection state for the authenticated user.
 * Powers the badge on the Crisis Mode nav item and the proposal UI.
 */
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tier = await getCrisisDetectionTier(userId);

    if (tier === "off") {
      return NextResponse.json({ active: false } satisfies CrisisDetectionStatus);
    }

    // Check for an existing cron-created detection
    const existing = await getActiveDetectionForUser(userId);

    if (existing) {
      return NextResponse.json({
        active: true,
        detectionId: existing.id,
        crisisRatio: Number(existing.crisisRatio),
        involvedTaskNames: existing.involvedTaskNames as string[],
        firstDeadline: existing.firstDeadline.toISOString(),
        availableMinutes: existing.availableMinutes,
        requiredMinutes: existing.requiredMinutes,
        crisisPlanId: existing.crisisPlanId ?? null,
        stale: false, // TODO: compare dataHash for auto-plans
      } satisfies CrisisDetectionStatus);
    }

    // No existing detection row — run detection inline for Watch-tier users
    // (and as a fresher check for all tiers between cron ticks)
    const [user, settings, allTasks] = await Promise.all([
      getUser(userId),
      getUserSettings(userId),
      getTasksByUser(userId), // Gets all non-cancelled tasks
    ]);

    const timezone = user?.timezone ?? "America/New_York";
    const wakeTime = settings?.wakeTime ?? 7;
    const sleepTime = settings?.sleepTime ?? 22;

    // Get actionable tasks with deadlines in the next 48 hours
    const now = new Date();
    const windowEnd = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    const tasksWithDeadlines = allTasks.filter((t) => {
      if (t.status !== "pending" && t.status !== "in_progress") return false;
      if (!t.deadline) return false;
      const dl = new Date(t.deadline);
      return dl > now && dl <= windowEnd;
    });

    if (tasksWithDeadlines.length === 0) {
      return NextResponse.json({ active: false } satisfies CrisisDetectionStatus);
    }

    // Fetch calendar events for the detection window
    const calendarRows = await getCalendarEventsByDateRange(userId, now, windowEnd);

    const result = detectCrisis({
      tasks: tasksWithDeadlines.map((t) => ({
        id: t.id,
        title: t.title,
        deadline: new Date(t.deadline!),
        estimatedMinutes: t.estimatedMinutes ?? 0,
        status: t.status,
      })),
      calendarEvents: calendarRows.map((e) => ({
        startTime: new Date(e.startTime),
        endTime: new Date(e.endTime),
        isAllDay: e.isAllDay ?? false,
      })),
      timezone,
      wakeTime,
      sleepTime,
    });

    if (!result) {
      return NextResponse.json({ active: false } satisfies CrisisDetectionStatus);
    }

    return NextResponse.json({
      active: true,
      crisisRatio: result.crisisRatio,
      involvedTaskNames: result.involvedTaskNames,
      firstDeadline: result.firstDeadline.toISOString(),
      availableMinutes: result.availableMinutes,
      requiredMinutes: result.requiredMinutes,
      crisisPlanId: null,
      stale: false,
    } satisfies CrisisDetectionStatus);
  } catch (error) {
    console.error("[API] GET /api/crisis-detection/status error:", error);
    return NextResponse.json(
      { error: "Failed to check crisis detection status" },
      { status: 500 }
    );
  }
}

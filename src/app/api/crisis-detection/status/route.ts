import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  getCrisisDetectionTier,
  getActiveDetectionForUser,
  updateCrisisDetection,
  getTasksByUser,
  getCalendarEventsByDateRange,
  getUserSettings,
  getUser,
  getRecentMoments,
} from "@/lib/db/queries";
import { detectCrisis } from "@/lib/crisis-detection";
import type { CrisisDetectionStatus, MomentType } from "@/types";

const DETECTION_WINDOW_HOURS = 48;

/**
 * GET /api/crisis-detection/status
 *
 * Returns the current crisis detection state for the authenticated user.
 * Powers the badge on the Crisis Mode nav item and the proposal UI.
 *
 * Detection is ALWAYS re-run against live data rather than trusting a stored
 * row: a stored detection goes stale the moment the user reschedules, deletes,
 * or completes one of the conflicting tasks, and the only other thing that
 * resolves a row is the 15-minute push-triggers cron — which iterates users
 * with push enabled, so users without push had no resolution path at all.
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

    const [existing, user, settings, allTasks] = await Promise.all([
      getActiveDetectionForUser(userId),
      getUser(userId),
      getUserSettings(userId),
      getTasksByUser(userId), // Gets all non-cancelled tasks
    ]);

    const timezone = user?.timezone ?? "America/New_York";
    const wakeTime = settings?.wakeTime ?? 7;
    const sleepTime = settings?.sleepTime ?? 22;

    // Get actionable tasks with deadlines in the detection window
    const now = new Date();
    const windowEnd = new Date(now.getTime() + DETECTION_WINDOW_HOURS * 60 * 60 * 1000);

    const tasksWithDeadlines = allTasks.filter((t) => {
      if (t.status !== "pending" && t.status !== "in_progress") return false;
      if (!t.deadline) return false;
      const dl = new Date(t.deadline);
      return dl > now && dl <= windowEnd;
    });

    let result = null;

    if (tasksWithDeadlines.length > 0) {
      // Fetch calendar events for the detection window + recent Moments for augmentation
      const [calendarRows, recentMomentRows] = await Promise.all([
        getCalendarEventsByDateRange(userId, now, windowEnd),
        getRecentMoments(userId, 120, ["tough_moment", "energy_crash"]),
      ]);

      result = detectCrisis({
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
        recentMoments: recentMomentRows.map((m) => ({
          type: m.type as MomentType,
          intensity: m.intensity,
          occurredAt: m.occurredAt,
        })),
        timezone,
        wakeTime,
        sleepTime,
      });
    }

    // --- The conflict is gone ---
    if (!result) {
      // Retire the stored row so the badge, cron, and banner all agree.
      if (existing) {
        await updateCrisisDetection(existing.id, { resolvedAt: new Date() });
        console.log(
          `[CrisisDetection] Resolved detection=${existing.id} user=${userId} (conflict cleared)`
        );
      }
      return NextResponse.json({ active: false } satisfies CrisisDetectionStatus);
    }

    // --- No stored row: a fresh inline detection, nothing to reconcile ---
    if (!existing) {
      return NextResponse.json({
        active: true,
        crisisRatio: result.crisisRatio,
        involvedTaskNames: result.involvedTaskNames,
        firstDeadline: result.firstDeadline.toISOString(),
        availableMinutes: result.availableMinutes,
        requiredMinutes: result.requiredMinutes,
        crisisPlanId: null,
        stale: false,
        dismissed: false,
      } satisfies CrisisDetectionStatus);
    }

    // --- Still a conflict, and we have a stored row: reconcile it ---
    // The situation may have shifted underneath a plan that was already built
    // (a task rescheduled out, another one added). Report the LIVE numbers and
    // task names, and flag the row as stale when the cast of tasks changed.
    const storedTaskIds = [...((existing.involvedTaskIds as string[]) ?? [])].sort();
    const liveTaskIds = [...result.involvedTaskIds].sort();
    const taskSetChanged =
      storedTaskIds.length !== liveTaskIds.length ||
      storedTaskIds.some((id, i) => id !== liveTaskIds[i]);

    await updateCrisisDetection(existing.id, {
      crisisRatio: result.crisisRatio,
      availableMinutes: result.availableMinutes,
      requiredMinutes: result.requiredMinutes,
      involvedTaskIds: result.involvedTaskIds,
      involvedTaskNames: result.involvedTaskNames,
      firstDeadline: result.firstDeadline,
    });

    return NextResponse.json({
      active: true,
      detectionId: existing.id,
      crisisRatio: result.crisisRatio,
      involvedTaskNames: result.involvedTaskNames,
      firstDeadline: result.firstDeadline.toISOString(),
      availableMinutes: result.availableMinutes,
      requiredMinutes: result.requiredMinutes,
      crisisPlanId: existing.crisisPlanId ?? null,
      // A plan built for a different set of tasks no longer matches reality.
      stale: taskSetChanged && existing.crisisPlanId !== null,
      dismissed: existing.dismissedAt !== null,
    } satisfies CrisisDetectionStatus);
  } catch (error) {
    console.error("[API] GET /api/crisis-detection/status error:", error);
    return NextResponse.json(
      { error: "Failed to check crisis detection status" },
      { status: 500 }
    );
  }
}

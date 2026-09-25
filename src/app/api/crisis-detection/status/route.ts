import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  getCrisisDetectionTier,
  getActiveDetectionForUser,
  updateCrisisDetection,
  createCrisisDetection,
  resolveCrisisDetection,
  getActionableTasksWithDeadlineInRange,
  getCalendarEventsByDateRange,
  getUserSettings,
  getUser,
  getRecentMoments,
  getLoggedMinutesForTasks,
} from "@/lib/db/queries";
import { detectCrisis } from "@/lib/crisis-detection";
import { DEFAULT_PLAN_BLOCK_MINUTES } from "@/lib/calendar/plan-blocks";
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

    // Actionable tasks with deadlines in the detection window, narrowed in SQL
    // rather than by pulling every task for the user and filtering in JS.
    const now = new Date();
    const windowEnd = new Date(now.getTime() + DETECTION_WINDOW_HOURS * 60 * 60 * 1000);

    const [existing, user, settings, tasksWithDeadlines] = await Promise.all([
      getActiveDetectionForUser(userId),
      getUser(userId),
      getUserSettings(userId),
      getActionableTasksWithDeadlineInRange(userId, now, windowEnd),
    ]);

    const timezone = user?.timezone ?? "America/New_York";
    const wakeTime = settings?.wakeTime ?? 7;
    const sleepTime = settings?.sleepTime ?? 22;

    let result = null;

    if (tasksWithDeadlines.length > 0) {
      // Fetch calendar events for the detection window + recent Moments for augmentation
      const [calendarRows, recentMomentRows, loggedMinutes] = await Promise.all([
        getCalendarEventsByDateRange(userId, now, windowEnd),
        getRecentMoments(userId, 120, ["tough_moment", "energy_crash"]),
        // Same as the cron: logged sitting work comes off the estimate.
        getLoggedMinutesForTasks(tasksWithDeadlines.map((t) => t.id), userId),
      ]);

      result = detectCrisis({
        tasks: tasksWithDeadlines.map((t) => ({
          id: t.id,
          title: t.title,
          deadline: new Date(t.deadline!),
          // Same defaults as the cron: no estimate counts as a plan block,
          // and a woken snooze is open work.
          estimatedMinutes: Math.max(
            0,
            (t.estimatedMinutes ?? DEFAULT_PLAN_BLOCK_MINUTES) - (loggedMinutes.get(t.id) ?? 0)
          ),
          status: t.status === "snoozed" ? "pending" : t.status,
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

    // This endpoint drives the crisis badge and banner, which are the emergency
    // surface. A "drift" result is a gentle nudge about the user's own targets
    // and must never light those up — so anything short of a real crisis is
    // treated here as no conflict. (Today the filter above passes only tasks
    // with hard deadlines, so drift cannot arise; this keeps that true if the
    // filter ever widens.)
    if (result?.severity === "drift") {
      result = null;
    }

    // --- The conflict is gone ---
    if (!result) {
      // Retire the stored row so the badge, cron, and banner all agree.
      if (existing) {
        await resolveCrisisDetection(existing);
        console.log(
          `[CrisisDetection] Resolved detection=${existing.id} user=${userId} (conflict cleared)`
        );
      }
      return NextResponse.json({ active: false } satisfies CrisisDetectionStatus);
    }

    // --- No stored row yet: store one ---
    // The cron only runs for push-subscribed users, so for everyone else this
    // is where the row gets made. Without it, Dismiss had nothing to mark and
    // the banner came right back.
    if (!existing) {
      const detection = await createCrisisDetection({
        userId,
        crisisRatio: result.crisisRatio,
        involvedTaskIds: result.involvedTaskIds,
        involvedTaskNames: result.involvedTaskNames,
        firstDeadline: result.firstDeadline,
        availableMinutes: result.availableMinutes,
        requiredMinutes: result.requiredMinutes,
      });
      return NextResponse.json({
        active: true,
        detectionId: detection.id,
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

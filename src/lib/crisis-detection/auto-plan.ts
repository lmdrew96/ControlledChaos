/**
 * Auto-Triage plans, built on request.
 *
 * Auto-Triage used to build a plan in the background the moment a collision
 * was detected, so a plan showing "0 of 5 steps" was waiting even when the
 * user was already working. Now the plan is built only when they tap
 * "Not yet, show me the plan" in the check-in sheet.
 */

import {
  createCrisisPlan,
  getCalendarEventsByDateRange,
  getPendingTasks,
  getUser,
  getUserSettings,
  updateCrisisDetection,
} from "@/lib/db/queries";
import { getCrisisPlan } from "@/lib/ai/crisis";
import type { CrisisParams } from "@/lib/ai/crisis";
import { getBlockedMinutes, getSleepBlockedMinutes, toBusyRows } from "./time-math";
import { formatForAI, formatForDisplay, DISPLAY_DATETIME } from "@/lib/timezone";

interface DetectionForPlan {
  id: string;
  involvedTaskIds: string[];
  involvedTaskNames: string[];
  firstDeadline: Date;
  requiredMinutes: number;
}

/**
 * Build and save an auto plan for a detection and link it to the row.
 * Returns the plan id, or null when the AI answered with strategies to pick
 * from instead of one plan (that needs the user's choice, so nothing is saved).
 */
export async function buildPlanForDetection(
  userId: string,
  detection: DetectionForPlan
): Promise<string | null> {
  const now = new Date();
  const firstDeadline = detection.firstDeadline;

  const [user, settings, calendarRows, pendingTasks] = await Promise.all([
    getUser(userId),
    getUserSettings(userId),
    getCalendarEventsByDateRange(userId, now, firstDeadline, { committedOnly: true }),
    getPendingTasks(userId),
  ]);
  const timezone = user?.timezone ?? "America/New_York";
  const wakeTime = settings?.wakeTime ?? 7;
  const sleepTime = settings?.sleepTime ?? 22;
  const busyRows = toBusyRows(calendarRows);

  // All dates are localized before they go into the prompt (see
  // api/crisis/route.ts's identical pattern), otherwise the model reads raw
  // UTC as the user's own local clock time.
  const taskName = detection.involvedTaskNames.join(" + ");
  const params: CrisisParams = {
    taskName,
    deadline: formatForDisplay(firstDeadline, timezone, DISPLAY_DATETIME),
    completionPct: 0, // Unknown for auto-detected crises
    currentTime: formatForAI(now, timezone),
    minutesUntilDeadline: Math.max(0, Math.round((firstDeadline.getTime() - now.getTime()) / 60_000)),
    sleepSchedule: {
      wakeTime,
      sleepTime,
      sleepMinutesBlocked: getSleepBlockedMinutes(wakeTime, sleepTime, now, firstDeadline, timezone),
    },
    blockedMinutes: getBlockedMinutes(busyRows, wakeTime, sleepTime, now, firstDeadline, timezone),
    // Clip to [now, firstDeadline] so only the part of an event that
    // actually blocks THIS deadline counts.
    upcomingEvents: busyRows
      .filter((e) => !e.isAllDay)
      .map((e) => {
        const clippedStart = new Date(Math.max(e.startTime.getTime(), now.getTime()));
        const clippedEnd = new Date(Math.min(e.endTime.getTime(), firstDeadline.getTime()));
        return {
          title: e.title,
          startTime: formatForDisplay(clippedStart, timezone, DISPLAY_DATETIME),
          endTime: formatForDisplay(clippedEnd, timezone, DISPLAY_DATETIME),
          durationMinutes: Math.round((clippedEnd.getTime() - clippedStart.getTime()) / 60_000),
        };
      })
      .filter((e) => e.durationMinutes > 0),
    existingPendingTaskCount: pendingTasks.length,
  };

  const crisisResult = await getCrisisPlan(params);
  if (crisisResult.type !== "plan") {
    console.log(`[CrisisDetection] Auto-triage returned strategies for detection=${detection.id}, not saving`);
    return null;
  }

  const plan = crisisResult.plan;
  const saved = await createCrisisPlan({
    userId,
    taskName,
    // Tied to the task only when there's exactly one: completing it then
    // closes the plan. A multi-task plan closes when the detection resolves.
    taskId: detection.involvedTaskIds.length === 1 ? detection.involvedTaskIds[0] : null,
    deadline: firstDeadline,
    completionPct: 0,
    panicLevel: plan.panicLevel,
    panicLabel: plan.panicLabel,
    summary: plan.summary,
    tasks: plan.tasks,
    source: "auto",
    dataHash: computeDataHash(detection.involvedTaskIds, detection.requiredMinutes, busyRows.length),
  });

  await updateCrisisDetection(detection.id, { crisisPlanId: saved.id });
  return saved.id;
}

/**
 * Simple hash of detection input data for staleness comparison.
 */
function computeDataHash(taskIds: string[], requiredMinutes: number, eventCount: number): string {
  const payload = JSON.stringify({
    taskIds: [...taskIds].sort(),
    requiredMinutes,
    eventCount,
  });
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    hash = ((hash << 5) - hash) + payload.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(36);
}

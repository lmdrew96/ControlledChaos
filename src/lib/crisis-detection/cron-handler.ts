/**
 * Crisis detection cron handler.
 * Called per-user from the 15-minute push-triggers cron job.
 */

import { detectCrisis } from "./detect";
import {
  getActiveDetectionForUser,
  createCrisisDetection,
  createCrisisPlan,
  updateCrisisDetection,
  resolveStaleDetections,
  getTasksByUser,
  getCalendarEventsByDateRange,
  getUserSettings,
  getUser,
  getRecentMoments,
} from "@/lib/db/queries";
import { getCrisisPlan } from "@/lib/ai/crisis";
import type { CrisisParams } from "@/lib/ai/crisis";
import { sendPushToUser } from "@/lib/notifications/send-push";
import { generatePushMessage, hasEverBeenNotified } from "@/lib/notifications/triggers";
import { getSleepBlockedMinutes } from "./time-math";
import { formatForAI, formatForDisplay, todayInTimezone, DISPLAY_DATETIME } from "@/lib/timezone";
import type { CrisisDetectionResult, CrisisDetectionTier, MomentType, NotificationPrefs, PersonalityPrefs, NotificationAssertiveness } from "@/types";

interface CronContext {
  userId: string;
  timezone: string;
  tier: CrisisDetectionTier;
  personalityPrefs: PersonalityPrefs | null;
  notificationPrefs: NotificationPrefs | null;
  assertivenessMode: NotificationAssertiveness;
  getSnapshot: () => Promise<string | undefined>;
  getLocationName: () => Promise<string | undefined>;
}

/**
 * Run crisis detection for a single user during the cron tick.
 * Handles detection, notification sending, and re-nudge logic.
 */
export async function runCrisisDetection(ctx: CronContext): Promise<{
  detected: boolean;
  notificationSent: boolean;
}> {
  const { userId, timezone, tier } = ctx;
  let notificationSent = false;

  // Clean up detections whose deadlines have passed
  await resolveStaleDetections(userId);

  // Skip detection if tier is off (shouldn't reach here, but safety check)
  if (tier === "off") return { detected: false, notificationSent: false };

  // Gather data for detection
  const [user, settings, allTasks] = await Promise.all([
    getUser(userId),
    getUserSettings(userId),
    getTasksByUser(userId),
  ]);

  const userTimezone = user?.timezone ?? timezone;
  const wakeTime = settings?.wakeTime ?? 7;
  const sleepTime = settings?.sleepTime ?? 22;

  const now = new Date();
  const windowEnd = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  // Actionable tasks with EITHER a hard deadline or a soft target in the
  // window. The drift tier needs the target-only ones, which a deadline-only
  // filter would have discarded before detection ever saw them.
  const tasksWithDeadlines = allTasks.filter((t) => {
    if (t.status !== "pending" && t.status !== "in_progress") return false;
    const dl = t.deadline ? new Date(t.deadline) : null;
    const target = t.targetDate ? new Date(t.targetDate) : null;
    const inWindow = (d: Date | null) => !!d && d > now && d <= windowEnd;
    return inWindow(dl) || inWindow(target);
  });

  // Fetch calendar events for the window and recent Moments for augmentation
  const [calendarRows, recentMomentRows] = await Promise.all([
    getCalendarEventsByDateRange(userId, now, windowEnd),
    // 2-hour window is the widest any Moment augmentation rule cares about
    getRecentMoments(userId, 120, [
      "tough_moment",
      "energy_crash",
    ]),
  ]);

  // A drift warning stands for the day it was sent. Feeding that back in gives
  // the detector its hysteresis band, so a workload parked near the threshold
  // can't flip the warning on and off every tick.
  const driftDedupKeyToday = `drift-${todayInTimezone(userTimezone)}`;
  const driftActive = await hasEverBeenNotified(userId, driftDedupKeyToday);

  // Run detection
  const result = detectCrisis({
    driftActive,
    tasks: tasksWithDeadlines.map((t) => ({
      id: t.id,
      title: t.title,
      deadline: t.deadline ? new Date(t.deadline) : null,
      targetDate: t.targetDate ? new Date(t.targetDate) : null,
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
    timezone: userTimezone,
    wakeTime,
    sleepTime,
  });

  // --- Drift: falling behind their OWN targets, not a crisis ---
  //
  // Handled before anything crisis-shaped and returned immediately: no
  // detection row, no /crisis deep link, no rescue plan, no crisis-toned copy.
  // A date the user set for themselves is theirs to move, and dressing that up
  // as an emergency is exactly how the app would start crying wolf.
  if (result?.severity === "drift") {
    if (driftActive) {
      return { detected: false, notificationSent: false };
    }

    const message = await generatePushMessage(
      {
        type: "target_reminder",
        taskTitle: result.involvedTaskNames.join(" and "),
        minutesUntil: Math.max(
          0,
          Math.round((result.firstDeadline.getTime() - now.getTime()) / 60_000)
        ),
      },
      ctx.personalityPrefs,
      userTimezone,
      ctx.assertivenessMode,
      await ctx.getLocationName(),
      await ctx.getSnapshot()
    );

    const sent = await sendPushToUser(userId, {
      title: "ControlledChaos",
      body: message,
      url: "/tasks",
      tag: driftDedupKeyToday,
      userId,
      bypassQuietHours: false,
    });

    console.log(
      `[CrisisDetection] Drift warning user=${userId} ratio=${result.crisisRatio} ` +
      `targets=${result.involvedTaskNames.join(", ")} sent=${sent}`
    );
    return { detected: false, notificationSent: sent };
  }

  // Check for existing active detection
  const existing = await getActiveDetectionForUser(userId);

  // --- No crisis detected ---
  if (!result) {
    if (existing) {
      // Crisis resolved — mark it
      await updateCrisisDetection(existing.id, { resolvedAt: new Date() });
      console.log(`[CrisisDetection] Resolved detection=${existing.id} for user=${userId}`);
    }
    return { detected: false, notificationSent: false };
  }

  // --- Crisis detected, no existing detection → create new ---
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

    console.log(
      `[CrisisDetection] New detection=${detection.id} user=${userId} ratio=${result.crisisRatio} ` +
      `tasks=${result.involvedTaskNames.join(", ")} tier=${tier}`
    );

    // Auto-Triage: generate a plan in the background
    if (tier === "auto_triage") {
      try {
        const planId = await generateAutoTriagePlan(
          userId,
          detection.id,
          result,
          calendarRows,
          userTimezone,
          wakeTime,
          sleepTime,
          allTasks.length
        );
        if (planId) {
          console.log(`[CrisisDetection] Auto-triage plan=${planId} generated for detection=${detection.id}`);
        }
      } catch (err) {
        console.error(`[CrisisDetection] Auto-triage plan generation failed for detection=${detection.id}:`, err);
      }
    }

    // Send notification for Nudge and Auto-Triage tiers
    if (tier === "nudge" || tier === "auto_triage") {
      notificationSent = await sendCrisisNotification(detection.id, result, ctx);
    }

    return { detected: true, notificationSent };
  }

  // --- Crisis detected, existing detection → check for worsening ---
  const oldRatio = Number(existing.crisisRatio);
  const newRatio = result.crisisRatio;

  // Update the stored ratio and minutes
  await updateCrisisDetection(existing.id, {
    crisisRatio: newRatio,
    availableMinutes: result.availableMinutes,
    requiredMinutes: result.requiredMinutes,
  });

  // Check if we should re-nudge (ratio worsened AND haven't re-nudged yet)
  if (
    newRatio > oldRatio &&
    !existing.reNudgeSent &&
    (tier === "nudge" || tier === "auto_triage")
  ) {
    const dedupKey = `crisis-renudge-${existing.id}`;
    if (!(await hasEverBeenNotified(userId, dedupKey))) {
      const message = await generatePushMessage(
        {
          type: "crisis_worsened",
          taskNames: result.involvedTaskNames,
          newRatio,
        },
        ctx.personalityPrefs,
        ctx.timezone,
        ctx.assertivenessMode,
        await ctx.getLocationName(),
        await ctx.getSnapshot()
      );

      const sent = await sendPushToUser(userId, {
        title: "ControlledChaos",
        body: message,
        url: "/crisis",
        tag: dedupKey,
        userId,
        bypassQuietHours: false,
      });

      if (sent) {
        await updateCrisisDetection(existing.id, { reNudgeSent: true });
        notificationSent = true;
        console.log(
          `[CrisisDetection] Re-nudge sent for detection=${existing.id} user=${userId} ` +
          `oldRatio=${oldRatio} newRatio=${newRatio}`
        );
      }
    }
  }

  return { detected: true, notificationSent };
}

/**
 * Send the initial crisis detection notification.
 */
async function sendCrisisNotification(
  detectionId: string,
  result: CrisisDetectionResult,
  ctx: CronContext
): Promise<boolean> {
  const dedupKey = `crisis-detect-${detectionId}`;

  if (await hasEverBeenNotified(ctx.userId, dedupKey)) {
    return false;
  }

  const message = await generatePushMessage(
    {
      type: "crisis_detected",
      taskNames: result.involvedTaskNames,
      availableHours: result.availableMinutes / 60,
      requiredHours: result.requiredMinutes / 60,
    },
    ctx.personalityPrefs,
    ctx.timezone,
    ctx.assertivenessMode,
    await ctx.getLocationName(),
    await ctx.getSnapshot()
  );

  return sendPushToUser(ctx.userId, {
    title: "ControlledChaos",
    body: message,
    url: "/crisis",
    tag: dedupKey,
    userId: ctx.userId,
    bypassQuietHours: false,
  });
}

/**
 * Generate an auto-triage plan for an auto_triage tier detection.
 * Calls getCrisisPlan() and saves the result with source: "auto".
 */
async function generateAutoTriagePlan(
  userId: string,
  detectionId: string,
  result: CrisisDetectionResult,
  calendarRows: Array<{ title: string; startTime: Date | string; endTime: Date | string; isAllDay: boolean | null }>,
  timezone: string,
  wakeTime: number,
  sleepTime: number,
  totalPendingTaskCount: number
): Promise<string | null> {
  const now = new Date();
  const firstDeadline = result.firstDeadline;
  const minutesUntilDeadline = Math.max(0, (firstDeadline.getTime() - now.getTime()) / 60_000);

  // Calculate sleep blocked between now and deadline
  const sleepMinutesBlocked = getSleepBlockedMinutes(
    wakeTime,
    sleepTime,
    now,
    firstDeadline,
    timezone
  );

  // Build CrisisParams for the AI — all dates must be localized before being
  // interpolated into the prompt (see api/crisis/route.ts's identical pattern),
  // otherwise the model reads raw UTC as the user's own local clock time.
  const taskName = result.involvedTaskNames.join(" + ");
  const params: CrisisParams = {
    taskName,
    deadline: formatForDisplay(firstDeadline, timezone, DISPLAY_DATETIME),
    completionPct: 0, // Unknown for auto-detected crises
    currentTime: formatForAI(now, timezone),
    minutesUntilDeadline: Math.round(minutesUntilDeadline),
    sleepSchedule: { wakeTime, sleepTime, sleepMinutesBlocked },
    // calendarRows spans the full 48h detection window, not this task's
    // deadline — clip to [now, firstDeadline] so events past THIS deadline
    // (e.g. tomorrow's classes) don't get counted as blocking it.
    upcomingEvents: calendarRows
      .filter((e) => !e.isAllDay)
      .filter((e) => new Date(e.startTime) < firstDeadline && new Date(e.endTime) > now)
      .map((e) => {
        const clippedStart = new Date(Math.max(new Date(e.startTime).getTime(), now.getTime()));
        const clippedEnd = new Date(Math.min(new Date(e.endTime).getTime(), firstDeadline.getTime()));
        return {
          title: e.title,
          startTime: formatForDisplay(clippedStart, timezone, DISPLAY_DATETIME),
          endTime: formatForDisplay(clippedEnd, timezone, DISPLAY_DATETIME),
          durationMinutes: Math.round((clippedEnd.getTime() - clippedStart.getTime()) / 60_000),
        };
      }),
    existingPendingTaskCount: totalPendingTaskCount,
  };

  const crisisResult = await getCrisisPlan(params);

  // Only handle single-plan results (not strategy multi-choice — that requires user input)
  if (crisisResult.type !== "plan") {
    console.log(`[CrisisDetection] Auto-triage returned strategies, skipping auto-save`);
    return null;
  }

  const plan = crisisResult.plan;
  const dataHash = computeDataHash(result.involvedTaskIds, result.requiredMinutes, calendarRows.length);

  const saved = await createCrisisPlan({
    userId,
    taskName,
    deadline: firstDeadline,
    completionPct: 0,
    panicLevel: plan.panicLevel,
    panicLabel: plan.panicLabel,
    summary: plan.summary,
    tasks: plan.tasks,
    source: "auto",
    dataHash,
  });

  // Link the plan to the detection
  await updateCrisisDetection(detectionId, { crisisPlanId: saved.id });

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

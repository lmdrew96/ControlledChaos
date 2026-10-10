/**
 * Crisis detection cron handler.
 * Called per-user from the 15-minute push-triggers cron job.
 */

import { detectCrisis } from "./detect";
import {
  getActiveDetectionForUser,
  createCrisisDetection,
  updateCrisisDetection,
  resolveCrisisDetection,
  resolveStaleDetections,
  getTasksByUser,
  getLoggedMinutesForTasks,
  getCalendarEventsByDateRange,
  getUserSettings,
  getUser,
  getRecentMoments,
} from "@/lib/db/queries";
import { toBusyRows } from "./time-math";
import { sendPushToUser } from "@/lib/notifications/send-push";
import {
  generatePushMessage,
  hasEverBeenNotified,
  recordDroppedAlert,
  type PushSkipReason,
} from "@/lib/notifications/triggers";
import { DEFAULT_PLAN_BLOCK_MINUTES } from "@/lib/calendar/plan-blocks";
import { todayInTimezone } from "@/lib/timezone";
import type { CrisisDetectionResult, CrisisDetectionTier, MomentType, NotificationPrefs, PersonalityPrefs, NotificationAssertiveness } from "@/types";

interface CronContext {
  userId: string;
  timezone: string;
  tier: CrisisDetectionTier;
  personalityPrefs: PersonalityPrefs | null;
  notificationPrefs: NotificationPrefs | null;
  assertivenessMode: NotificationAssertiveness;
  getSnapshot: () => Promise<string | undefined>;
  /**
   * Why an app-lane push can't go out this tick, or null if it can. Crisis
   * pushes are app-initiated, so the daily cap and tick budget apply.
   */
  appPushRefusal: () => PushSkipReason | null;
}

/**
 * One chance per alert. Quiet hours hold the push for later; any other
 * refusal drops it for the day (recorded, so the next tick doesn't retry it
 * and land on the cron's beat). Returns true if the push may go out now.
 */
async function mayPushNow(ctx: CronContext, dedupKey: string): Promise<boolean> {
  const reason = ctx.appPushRefusal();
  if (reason === null) return true;
  if (reason !== "quiet_hours") {
    await recordDroppedAlert(ctx.userId, [dedupKey], reason);
    console.log(`[CrisisDetection] drop key=${dedupKey} user=${ctx.userId} reason=${reason}`);
  }
  return false;
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
  // Snoozed tasks count once the snooze has run out, like getPendingTasks.
  const tasksWithDeadlines = allTasks.filter((t) => {
    const wokenSnooze =
      t.status === "snoozed" && (!t.snoozedUntil || new Date(t.snoozedUntil) <= now);
    if (t.status !== "pending" && t.status !== "in_progress" && !wokenSnooze) return false;
    const dl = t.deadline ? new Date(t.deadline) : null;
    const target = t.targetDate ? new Date(t.targetDate) : null;
    const inWindow = (d: Date | null) => !!d && d > now && d <= windowEnd;
    return inWindow(dl) || inWindow(target);
  });

  // Fetch calendar events for the window and recent Moments for augmentation
  const [calendarRows, recentMomentRows, loggedMinutes] = await Promise.all([
    getCalendarEventsByDateRange(userId, now, windowEnd, { committedOnly: true }),
    // 2-hour window is the widest any Moment augmentation rule cares about
    getRecentMoments(userId, 120, [
      "tough_moment",
      "energy_crash",
    ]),
    // Work already logged in sittings. A task that's half done needs half
    // its estimate, not all of it, or the collision math cries wolf.
    getLoggedMinutesForTasks(tasksWithDeadlines.map((t) => t.id), userId),
  ]);

  // The status route and manual rescue build busy time through the same
  // helper, so all three see one number.
  const busyRows = toBusyRows(calendarRows);

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
      // No estimate isn't no work — most Canvas items arrive without one, and
      // treating them as zero hid them from detection entirely. Assume a
      // plan block's default length.
      estimatedMinutes: Math.max(
        0,
        (t.estimatedMinutes ?? DEFAULT_PLAN_BLOCK_MINUTES) - (loggedMinutes.get(t.id) ?? 0)
      ),
      // A woken snooze is open work again.
      status: t.status === "snoozed" ? "pending" : t.status,
    })),
    calendarEvents: busyRows,
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
    if (driftActive || !(await mayPushNow(ctx, driftDedupKeyToday))) {
      return { detected: false, notificationSent: false };
    }

    const message = await generatePushMessage(
      {
        type: "target_reminder",
        taskTitle: result.involvedTaskNames.join(" and "),
        at: result.firstDeadline,
        minutesUntil: Math.max(
          0,
          Math.round((result.firstDeadline.getTime() - now.getTime()) / 60_000)
        ),
      },
      ctx.personalityPrefs,
      userTimezone,
      ctx.assertivenessMode,
      await ctx.getSnapshot()
    );

    const sent = await sendPushToUser(userId, {
      title: "ControlledChaos",
      body: message,
      url: "/tasks",
      tag: driftDedupKeyToday,
      bypassQuietHours: false,
    lane: "app",
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
      // Crisis resolved — mark it, and close the auto plan made for it.
      await resolveCrisisDetection(existing);
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

  // The user said they're on it. No more escalation — the app can't see
  // off-app work, so a worsening ratio here says nothing about their progress.
  // One supportive heads-up near the deadline, and that's all.
  if (existing.engagedAt) {
    if (tier === "nudge" || tier === "auto_triage") {
      notificationSent = await sendFinalHeadsUp(existing.id, result, ctx);
    }
    return { detected: true, notificationSent };
  }

  // The first push for this detection may never have gone out: quiet hours
  // held it back on the tick that created the detection, and every later
  // tick lands here, not in the new-detection branch above. A push dropped
  // for the cap or budget gets its next chance a day later.
  // sendCrisisNotification dedups on its own key, so this is a no-op once sent.
  if (tier === "nudge" || tier === "auto_triage") {
    if (await sendCrisisNotification(existing.id, result, ctx)) {
      return { detected: true, notificationSent: true };
    }
  }

  // Check if we should re-nudge (ratio worsened AND haven't re-nudged yet)
  if (
    newRatio > oldRatio &&
    !existing.reNudgeSent &&
    (tier === "nudge" || tier === "auto_triage")
  ) {
    const dedupKey = `crisis-renudge-${existing.id}`;
    if (!(await hasEverBeenNotified(userId, dedupKey)) && (await mayPushNow(ctx, dedupKey))) {
      const message = await generatePushMessage(
        {
          type: "crisis_worsened",
          taskNames: result.involvedTaskNames,
        },
        ctx.personalityPrefs,
        ctx.timezone,
        ctx.assertivenessMode,
        await ctx.getSnapshot()
      );

      const sent = await sendPushToUser(userId, {
        title: "ControlledChaos",
        body: message,
        url: checkInUrl(existing.id),
        tag: dedupKey,
        bypassQuietHours: false,
        lane: "app",
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

/** Same involved tasks on the same local day → same key, whatever the detection row. */
export const crisisTaskSetKey = (taskIds: string[], dateKey: string): string =>
  `crisis-tasks-${[...new Set(taskIds)].sort().join(",")}-${dateKey}`;

/** Tapping a crisis push opens the "Already working on this?" check-in. */
function checkInUrl(detectionId: string): string {
  return `/crisis?checkin=${detectionId}`;
}

/**
 * How close to the deadline an engaged crisis gets its one heads-up. Wider
 * than the cron interval, so a tick always lands inside it.
 */
const FINAL_HEADSUP_MINUTES = 15;

/**
 * The one push an engaged crisis gets: a supportive line shortly before the
 * deadline. Deduped per detection, so it can only ever go out once.
 */
async function sendFinalHeadsUp(
  detectionId: string,
  result: CrisisDetectionResult,
  ctx: CronContext
): Promise<boolean> {
  const minutesUntil = Math.round((result.firstDeadline.getTime() - Date.now()) / 60_000);
  if (minutesUntil <= 0 || minutesUntil > FINAL_HEADSUP_MINUTES) return false;

  const dedupKey = `crisis-final-${detectionId}`;
  if ((await hasEverBeenNotified(ctx.userId, dedupKey)) || !(await mayPushNow(ctx, dedupKey))) {
    return false;
  }

  const message = await generatePushMessage(
    {
      type: "crisis_final_headsup",
      taskNames: result.involvedTaskNames,
      minutesUntil,
      at: result.firstDeadline,
    },
    ctx.personalityPrefs,
    ctx.timezone,
    ctx.assertivenessMode,
    await ctx.getSnapshot()
  );

  return sendPushToUser(ctx.userId, {
    title: "ControlledChaos",
    body: message,
    url: "/crisis",
    tag: dedupKey,
    bypassQuietHours: false,
    lane: "app",
  });
}

/**
 * Send the initial crisis detection notification. It asks whether the user
 * is already on it rather than assuming they haven't started.
 */
export async function sendCrisisNotification(
  detectionId: string,
  result: CrisisDetectionResult,
  ctx: CronContext
): Promise<boolean> {
  const dedupKey = `crisis-detect-${detectionId}`;
  // When detections flap (resolve, then get re-created), each new row has a
  // fresh id, so the per-row key alone re-announced the same crisis every
  // tick (LING 202, 5 pings in 40 min on 10/6). The task-set key holds it to
  // one push per local day. The new row's check-in link still works; only the
  // push is skipped.
  const taskSetKey =
    result.involvedTaskIds.length > 0
      ? crisisTaskSetKey(result.involvedTaskIds, todayInTimezone(ctx.timezone))
      : null;

  if (
    (await hasEverBeenNotified(ctx.userId, dedupKey)) ||
    (taskSetKey !== null && (await hasEverBeenNotified(ctx.userId, taskSetKey))) ||
    !(await mayPushNow(ctx, dedupKey))
  ) {
    return false;
  }

  const message = await generatePushMessage(
    {
      type: "crisis_detected",
      taskNames: result.involvedTaskNames,
    },
    ctx.personalityPrefs,
    ctx.timezone,
    ctx.assertivenessMode,
    await ctx.getSnapshot()
  );

  return sendPushToUser(ctx.userId, {
    title: "ControlledChaos",
    body: message,
    url: checkInUrl(detectionId),
    tag: dedupKey,
    dedupKeys: taskSetKey ? [dedupKey, taskSetKey] : [dedupKey],
    bypassQuietHours: false,
    lane: "app",
  });
}

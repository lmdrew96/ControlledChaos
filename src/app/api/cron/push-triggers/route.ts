import { NextResponse } from "next/server";
import {
  getAllUsersWithPushEnabled,
  getPendingSnoozedPushes,
  markSnoozedPushSent,
  getUserLocation,
  isLocationStale,
  getScheduledSessionsInRange,
} from "@/lib/db/queries";
import {
  sendPushToUser,
  type PushAction,
} from "@/lib/notifications/send-push";
import {
  isQuietHours,
  minutesSinceQuietHoursEnded,
} from "@/lib/notifications/quiet-hours";
import { todayInTimezone, allDayRange, getHourInTimezone } from "@/lib/timezone";
import {
  buildWakeSummaryBody,
  type WakeSummaryItem,
} from "@/lib/notifications/wake-summary";
import {
  getDeadlineReminders,
  getTargetReminders,
  getEventReminders,
  getDailyPushCap,
  getAssertivenessMode,
  getScheduledTaskAlerts,
  getMissedScheduledTaskAlerts,
  getDepartureAlerts,
  getAppPushesSentToday,
  CHECK_IN_START_HOUR,
  shouldSendIdleCheckin,
  shouldSendAfternoonCheckin,
  getEveningCheckinStatus,
  resolveDailyCheckInConfig,
  hasBeenNotifiedToday,
  hasEverBeenNotified,
  getNotifiedDedupKeys,
  getInactivityNudgeTier,
  generateNudgeMessage,
  generatePushMessage,
  getTopPendingTask,
  type AlertingTaskDetail,
  type PushNotificationContext,
} from "@/lib/notifications/triggers";
import {
  clusterAlerts,
  extractCourseCode,
  type ClusterableAlert,
} from "@/lib/notifications/cluster";
import { buildUserSnapshot } from "@/lib/context/user-snapshot";
import { runCrisisDetection } from "@/lib/crisis-detection/cron-handler";
import { verifyCronRequest } from "@/lib/cron-auth";

// Vercel Pro: 60s max. Default (10s) silently truncates the per-user loop
// once the user count grows past ~5–10 push-enabled users.
export const maxDuration = 60;

// Per-chunk concurrency for the per-user loop. AI message generation is the
// dominant cost per user; ~10 in-flight is well below typical Anthropic API
// rate limits while keeping total wall-clock under maxDuration.
const USER_CONCURRENCY = 10;

const TASK_ACTIONS = [
  { action: "start_task", title: "▶ Start" },
  { action: "snooze", title: "⏰ Snooze 30 min" },
];

const IDLE_ACTIONS = [
  { action: "brain_dump", title: "✏ Brain Dump" },
  { action: "see_tasks", title: "📋 See Tasks" },
];

const MISSED_TASK_ACTIONS = [
  { action: "start_task", title: "▶ Start now" },
  { action: "snooze", title: "⏰ Snooze 30 min" },
];

const EVENT_ACTIONS = [
  { action: "see_calendar", title: "📅 View" },
];

type PushUser = Awaited<ReturnType<typeof getAllUsersWithPushEnabled>>[number];

/** Who a push is for: see refusal() in processUser. */
type PushLane = "user" | "app";

/** Why a push was held back this tick. Logged verbatim, so keep it honest. */
type SkipReason = "quiet_hours" | "tick_budget" | "daily_cap" | "pacing";

/**
 * An alert that is eligible to send this tick, before clustering decides
 * whether it gets its own push or is folded into a neighbour's.
 */
type Candidate = ClusterableAlert & {
  priority: "high" | "normal";
  bypassQuietHours: boolean;
  /** Whether the key must be unique forever or only for today. */
  dedupScope: "ever" | "today";
  /** Minutes until the thing happens; absent for scheduled-start alerts. */
  intervalMinutes?: number;
  /** The alerting task is already underway — don't tell them to start it. */
  inProgress?: boolean;
  /** Where the event is, for event alerts. */
  location?: string | null;
  /** Size and stakes of the task, for scheduled-start alerts. */
  taskDetail?: AlertingTaskDetail;
  url: string;
  taskId?: string;
  actions: PushAction[];
};

const pickTaskDetail = (a: AlertingTaskDetail): AlertingTaskDetail => ({
  estimatedMinutes: a.estimatedMinutes,
  sessionMinutes: a.sessionMinutes,
  deadline: a.deadline,
  targetDate: a.targetDate,
});

/**
 * Build the AI context for a cluster: the primary alert's own shape, plus the
 * titles of whatever was folded into it so the model writes one message for
 * the whole situation.
 */
function buildClusterContext(
  primary: Candidate,
  absorbed: Candidate[]
): PushNotificationContext {
  const alsoHappening = absorbed.map((a) => ({ title: a.title, at: a.at }));
  // Time remaining must be measured from the clock, NOT read off
  // `intervalMinutes`. That field is the reminder BAND the alert matched
  // (1440/60/10) — a label used for dedup keys and priority gating — so
  // anything between 1 and 24 hours out carries `1440` and used to be
  // described to the model as "1 day", i.e. "tomorrow". Quiet hours made it
  // worst: an alert that became eligible at 22:00 and was held until 07:00
  // still announced a 2-hours-away deadline as tomorrow.
  const minutesUntil = Math.max(
    0,
    Math.round((primary.at.getTime() - Date.now()) / 60000)
  );
  switch (primary.kind) {
    case "deadline":
      return {
        type: "deadline_reminder",
        taskTitle: primary.title,
        minutesUntil,
        at: primary.at,
        inProgress: primary.inProgress,
        alsoHappening,
      };
    case "event":
      return {
        type: "event_reminder",
        eventTitle: primary.title,
        minutesUntil,
        at: primary.at,
        location: primary.location,
        alsoHappening,
      };
    case "target":
      return {
        type: "target_reminder",
        taskTitle: primary.title,
        minutesUntil,
        at: primary.at,
        inProgress: primary.inProgress,
        alsoHappening,
      };
    case "scheduled":
    case "scheduled_missed":
      return {
        type: primary.kind,
        taskTitle: primary.title,
        at: primary.at,
        ...primary.taskDetail,
        alsoHappening,
      };
  }
}

/**
 * Per-user trigger evaluation. Returns the number of pushes sent for this user
 * so the outer loop can aggregate without shared mutable state.
 */
async function processUser(user: PushUser): Promise<number> {
  const { userId, timezone, personalityPrefs, notificationPrefs, crisisDetectionTier } = user;
  const mode = getAssertivenessMode(notificationPrefs);
  const dailyCap = getDailyPushCap(mode);
  // Only APP-lane pushes are counted or capped. See getAppPushesSentToday.
  let appSentToday = await getAppPushesSentToday(userId, timezone);
  let userSent = 0;

  // Compute quiet hours once — gates AI generation so we don't pay for messages
  // that sendPushToUser would silently suppress anyway.
  const quietHoursActive = notificationPrefs ? isQuietHours(notificationPrefs, timezone) : false;

  // Lazy location fetch — only hits DB on first call, cached for this user
  let _locationName: string | undefined;
  let _locationFetched = false;
  const getLocationName = async () => {
    if (!_locationFetched) {
      const userLoc = await getUserLocation(userId);
      // Stale location (app hasn't been foregrounded recently) is worse than no
      // location — don't let the AI assert a "current" location that's actually hours old.
      _locationName =
        userLoc?.matchedLocationName && !isLocationStale(userLoc.updatedAt)
          ? userLoc.matchedLocationName
          : undefined;
      _locationFetched = true;
    }
    return _locationName;
  };

  // Build user context snapshot once per user — shared across all notification types
  let _snapshot: string | undefined;
  let _snapshotFetched = false;
  const getSnapshot = async () => {
    if (!_snapshotFetched) {
      try {
        const snapshot = await buildUserSnapshot(userId);
        _snapshot = snapshot.formatted;
      } catch (err) {
        console.error(`[Push] snapshot failed for user=${userId}:`, err);
      }
      _snapshotFetched = true;
    }
    return _snapshot;
  };

  // Per-tick budgets. Without them, every reminder that became eligible during
  // quiet hours fires in the same tick the moment quiet hours end — the
  // "bombarded at wake time" bug. Budgeted items retry next tick, since
  // eligibility windows (the [1440,60,10] reminder bands) stay open far longer
  // than a few ticks. The overnight backlog doesn't go through this at all:
  // it is folded into the wake-up summary below.
  //
  // High-priority alerts used to skip this AND the daily cap entirely, which
  // is how a single class-plus-homework hour produced an unbounded burst: at
  // <=60 min everything is high-priority, so nothing was holding it back. They
  // now get their own (larger) budget and respect the user's assertiveness cap.
  const NORMAL_PUSH_TICK_BUDGET = 1;
  const HIGH_PUSH_TICK_BUDGET = 2;
  // Right up against the wire, a missed alert costs more than an extra push,
  // so these bypass both the tick budget and the daily cap. Quiet hours still
  // apply unless the alert separately opts out.
  const ALWAYS_SEND_MINUTES = 15;
  // How long after quiet hours end the wake-up summary may still go out. Wide
  // enough to survive a missed tick or two; narrow enough that it never lands
  // as a "morning" summary in the afternoon.
  const WAKE_SUMMARY_WINDOW_MINUTES = 180;

  let normalSentThisTick = 0;
  let highSentThisTick = 0;

  // Pacing: at most half the app-lane allowance may go out before the user's
  // check-in window opens, so a morning of nudges can't spend the whole day.
  const checkInConfig = resolveDailyCheckInConfig(notificationPrefs);
  const beforeCheckInWindow =
    getHourInTimezone(new Date(), timezone) < CHECK_IN_START_HOUR[checkInConfig.window];
  const appPacingLimit = Math.ceil(dailyCap / 2);

  /**
   * Why a push may not go out this tick, or null if it may.
   *
   * Two lanes. USER-lane pushes (reminders the user configured, planned
   * starts, the check-in, time-to-leave) are never blocked by the daily cap.
   * APP-lane pushes (inactivity nudges, missed-session follow-ups, crisis)
   * are the only ones the cap and pacing govern. Quiet hours and the per-tick
   * budget apply to both.
   */
  const refusal = (
    lane: PushLane,
    priority: "high" | "normal",
    bypassesQuietHours = false,
    urgent = false
  ): SkipReason | null => {
    if (quietHoursActive && !bypassesQuietHours) return "quiet_hours";
    if (urgent) return null;
    const budget = priority === "high" ? HIGH_PUSH_TICK_BUDGET : NORMAL_PUSH_TICK_BUDGET;
    const usedThisTick = priority === "high" ? highSentThisTick : normalSentThisTick;
    if (usedThisTick >= budget) return "tick_budget";
    if (lane === "app") {
      if (appSentToday >= dailyCap) return "daily_cap";
      if (beforeCheckInWindow && appSentToday >= appPacingLimit) return "pacing";
    }
    return null;
  };

  const markSent = (lane: PushLane, priority: "high" | "normal" = "high") => {
    if (lane === "app") appSentToday += 1;
    userSent += 1;
    if (priority === "normal") normalSentThisTick += 1;
    else highSentThisTick += 1;
  };

  // --- Upcoming-thing alerts: collect, cluster, then send ---
  //
  // Deadlines, event reminders and scheduled starts all answer the same
  // question ("something is coming up"), and a single situation routinely
  // produces several of them — a class meeting plus the homework due at the
  // start of it. Sending each one as it is found is what produced the
  // lock-screen burst. So: gather every eligible alert first, drop the ones
  // already notified, group what's left by situation, and send one push per
  // group. See lib/notifications/cluster.ts for the grouping rules.
  //
  // Time-to-leave and crisis alerts stay out of this on purpose (below):
  // "leave now" must never be buried inside a merged message.
  const candidates: Candidate[] = [];

  for (const r of await getDeadlineReminders(userId, notificationPrefs)) {
    candidates.push({
      kind: "deadline",
      dedupKey: `deadline-${r.taskId}-${r.intervalMinutes}-${r.deadline.toISOString()}`,
      dedupScope: "ever",
      at: r.deadline,
      title: r.taskTitle,
      courseCode: extractCourseCode(r.taskTitle, r.taskDescription),
      sourceEventId: r.sourceEventId,
      intervalMinutes: r.intervalMinutes,
      inProgress: r.taskStatus === "in_progress",
      priority: r.intervalMinutes <= 60 ? "high" : "normal",
      // Quiet hours are the user's explicit instruction and the settings screen
      // promises them unconditionally. A near deadline does NOT earn an override:
      // this used to be `r.intervalMinutes <= 30`, which meant anyone with a
      // 10-minute reminder configured got woken up mid-quiet-hours.
      bypassQuietHours: false,
      url: `/tasks?taskId=${r.taskId}`,
      taskId: r.taskId,
      actions: TASK_ACTIONS,
    });
  }

  // Targets are gathered AFTER deadlines so a task whose hard deadline is
  // firing this tick doesn't also get a gentle "you'd wanted this done" ping.
  const taskIdsWithFiringDeadline = new Set(
    candidates.flatMap((c) => (c.kind === "deadline" && c.taskId ? [c.taskId] : []))
  );

  for (const r of await getTargetReminders(
    userId,
    notificationPrefs,
    taskIdsWithFiringDeadline
  )) {
    candidates.push({
      kind: "target",
      dedupKey: `target-${r.taskId}-${r.intervalMinutes}-${r.targetDate.toISOString()}`,
      dedupScope: "ever",
      at: r.targetDate,
      title: r.taskTitle,
      courseCode: extractCourseCode(r.taskTitle, r.taskDescription),
      sourceEventId: r.sourceEventId,
      intervalMinutes: r.intervalMinutes,
      inProgress: r.taskStatus === "in_progress",
      // Always normal, never high, whatever the interval. A self-imposed date
      // with slack behind it never earns the urgent lane or a quiet-hours pass.
      priority: "normal",
      bypassQuietHours: false,
      url: `/tasks?taskId=${r.taskId}`,
      taskId: r.taskId,
      actions: TASK_ACTIONS,
    });
  }

  for (const r of await getEventReminders(userId, notificationPrefs)) {
    candidates.push({
      kind: "event",
      dedupKey: `event-${r.eventId}-${r.intervalMinutes}-${r.startTime.toISOString()}`,
      dedupScope: "ever",
      at: r.startTime,
      title: r.eventTitle,
      courseCode: extractCourseCode(r.eventTitle, r.location),
      externalId: r.externalId,
      intervalMinutes: r.intervalMinutes,
      location: r.location,
      priority: r.intervalMinutes <= 60 ? "high" : "normal",
      // See the deadline reminder above — proximity never overrides quiet hours.
      bypassQuietHours: false,
      url: "/calendar",
      actions: EVENT_ACTIONS,
    });
  }

  for (const a of await getScheduledTaskAlerts(userId)) {
    candidates.push({
      kind: "scheduled",
      dedupKey: `scheduled-${a.taskId}-${a.scheduledFor.toISOString().slice(0, 16)}`,
      dedupScope: "today",
      at: a.scheduledFor,
      title: a.taskTitle,
      courseCode: extractCourseCode(a.taskTitle, a.taskDescription),
      sourceEventId: a.sourceEventId,
      taskDetail: pickTaskDetail(a),
      priority: "normal",
      bypassQuietHours: false,
      url: `/tasks?taskId=${a.taskId}`,
      taskId: a.taskId,
      actions: TASK_ACTIONS,
    });
  }

  if (mode === "assertive") {
    for (const a of await getMissedScheduledTaskAlerts(userId)) {
      candidates.push({
        kind: "scheduled_missed",
        dedupKey: `scheduled-missed-${a.taskId}-${a.scheduledFor.toISOString().slice(0, 13)}`,
        dedupScope: "today",
        at: a.scheduledFor,
        title: a.taskTitle,
        courseCode: extractCourseCode(a.taskTitle, a.taskDescription),
        sourceEventId: a.sourceEventId,
        taskDetail: pickTaskDetail(a),
        priority: "normal",
        bypassQuietHours: false,
        url: `/tasks?taskId=${a.taskId}`,
        taskId: a.taskId,
        actions: MISSED_TASK_ACTIONS,
      });
    }
  }

  // Drop already-notified alerts BEFORE clustering. Filtering afterwards
  // would let a stale member become a cluster's primary and suppress the
  // fresh alerts grouped with it.
  const todayKey = todayInTimezone(timezone);
  const wakeSummaryKey = `wake-summary-${todayKey}`;
  const checkInDedupKey = `idle-checkin-${todayKey}`;
  const sinceQuietEnd = notificationPrefs
    ? minutesSinceQuietHoursEnded(notificationPrefs, timezone)
    : null;
  const wakeSummaryWindow =
    sinceQuietEnd !== null && sinceQuietEnd < WAKE_SUMMARY_WINDOW_MINUTES;

  const notified = candidates.length > 0 || wakeSummaryWindow
    ? await getNotifiedDedupKeys(userId, timezone)
    : { ever: new Set<string>(), today: new Set<string>() };
  let fresh = candidates.filter((c) =>
    c.dedupScope === "ever"
      ? !notified.ever.has(c.dedupKey)
      : !notified.today.has(c.dedupKey)
  );

  // --- Wake-up summary ---
  //
  // Everything that became eligible overnight used to wait out quiet hours
  // and then drip out one push per tick (6:00, 6:10, 6:20…), because
  // eligibility windows stay open for hours. Instead, the first tick after
  // quiet hours folds today's pending reminders into ONE push, built from
  // data rather than the model, and marks every folded key as notified. The
  // closer 60/10 bands still fire normally later on.
  if (
    wakeSummaryWindow &&
    !notified.today.has(wakeSummaryKey) &&
    refusal("user", "normal") === null
  ) {
    const endOfToday = new Date(allDayRange(todayKey, timezone).endISO);
    const foldable = fresh.filter(
      (c) =>
        // Start-now cues are about this exact moment, not the day's shape.
        c.kind !== "scheduled" &&
        c.kind !== "scheduled_missed" &&
        c.at < endOfToday &&
        !(c.intervalMinutes !== undefined && c.intervalMinutes <= ALWAYS_SEND_MINUTES)
    );
    const sittings = await getScheduledSessionsInRange(userId, new Date(), endOfToday);
    const items: WakeSummaryItem[] = [
      ...foldable.map((c) => ({
        at: c.at,
        title: c.title,
        kind: c.kind as WakeSummaryItem["kind"],
      })),
      ...sittings.map((t) => ({ at: t.scheduledFor, title: t.title, kind: "session" as const })),
    ];

    const replacesCheckIn = checkInConfig.enabled && checkInConfig.window === "morning";
    // Only when there's an overnight backlog to replace, or when it stands in
    // for the morning check-in. Otherwise it would just be one more push.
    if (items.length > 0 && (foldable.length > 0 || replacesCheckIn)) {
      const sent = await sendPushToUser(userId, {
        title: "ControlledChaos",
        body: buildWakeSummaryBody(items, timezone),
        url: "/calendar",
        tag: wakeSummaryKey,
        dedupKeys: [
          wakeSummaryKey,
          ...foldable.map((c) => c.dedupKey),
          // A morning check-in right after this would be a second "here's
          // your day" push. The summary is the check-in.
          ...(replacesCheckIn ? [checkInDedupKey] : []),
        ],
        userId,
        actions: EVENT_ACTIONS,
        lane: "user",
      });
      if (sent) {
        markSent("user", "normal");
        const folded = new Set(foldable.map((c) => c.dedupKey));
        fresh = fresh.filter((c) => !folded.has(c.dedupKey));
        console.log(`[Push][WakeSummary] user=${userId} items=${items.length} folded=${folded.size}`);
      }
    }
  }

  // Soonest first, so the tick budget is spent on the most urgent situation.
  fresh.sort((a, b) => a.at.getTime() - b.at.getTime());

  for (const cluster of clusterAlerts(fresh)) {
    const { primary, absorbed, dedupKeys } = cluster;
    // The cluster inherits the most permissive gating of its members: it
    // speaks for all of them, so it must not be held back by the calmest one.
    const members = [primary, ...absorbed];
    const priority = members.some((m) => m.priority === "high") ? "high" : "normal";
    const bypassQuietHours = members.some((m) => m.bypassQuietHours);
    // Soft targets are excluded from the always-send lane regardless of how
    // short an interval the user configured. A date someone set for themselves,
    // with slack behind it, must never be able to punch through the daily cap.
    const urgent = members.some(
      (m) =>
        m.kind !== "target" &&
        m.intervalMinutes !== undefined &&
        m.intervalMinutes <= ALWAYS_SEND_MINUTES
    );

    // A missed-session follow-up is the app's idea; everything else here is a
    // reminder the user set up or a start they planned. A cluster speaks for
    // all its members, so it's app-lane only if every member is.
    const lane: PushLane = members.every((m) => m.kind === "scheduled_missed")
      ? "app"
      : "user";

    const reason = refusal(lane, priority, bypassQuietHours, urgent);
    if (reason) {
      // Quiet hours hold every candidate every tick all night; logging those
      // would bury the skips worth reading.
      if (reason !== "quiet_hours") {
        console.log(
          `[Push][Skip] user=${userId} kind=${primary.kind} lane=${lane} reason=${reason} appSentToday=${appSentToday} cap=${dailyCap}`
        );
      }
      continue;
    }

    const message = await generatePushMessage(
      buildClusterContext(primary, absorbed),
      personalityPrefs,
      timezone,
      mode,
      await getLocationName(),
      await getSnapshot()
    );
    const sent = await sendPushToUser(userId, {
      title: "ControlledChaos",
      body: message,
      url: primary.url,
      tag: primary.dedupKey,
      dedupKeys,
      taskId: primary.taskId,
      userId,
      actions: primary.actions,
      bypassQuietHours,
      lane,
    });
    if (sent) {
      markSent(lane, priority);
      if (absorbed.length > 0) {
        console.log(
          `[Push][Cluster] user=${userId} merged=${members.length} primary=${primary.kind} absorbed=${absorbed.map((a) => a.kind).join(",")}`
        );
      }
    }
  }

  // --- Time to Leave Alerts ---
  const departureAlerts = await getDepartureAlerts(userId, timezone);
  for (const alert of departureAlerts) {
    // "Leave now" is the one alert where being late is unrecoverable, so it
    // bypasses the tick budget and the daily cap outright.
    if (refusal("user", "high", alert.level === "now", alert.level === "now")) continue;

    const dedupKey = `time-to-leave-${alert.eventId}-${alert.level}`;
    if (await hasBeenNotifiedToday(userId, dedupKey, timezone)) continue;

    const notifCtx = alert.level === "now"
      ? { type: "time_to_leave_now" as const, eventTitle: alert.eventTitle, destination: alert.destination, commuteMinutes: alert.commuteMinutes }
      : { type: "time_to_leave_soon" as const, eventTitle: alert.eventTitle, minutesUntilLeave: alert.minutesUntilLeave, destination: alert.destination, commuteMinutes: alert.commuteMinutes };

    const message = await generatePushMessage(
      notifCtx,
      personalityPrefs,
      timezone,
      mode,
      await getLocationName(),
      await getSnapshot()
    );
    const sent = await sendPushToUser(userId, {
      title: "ControlledChaos",
      body: message,
      url: "/calendar",
      tag: dedupKey,
      userId,
      bypassQuietHours: alert.level === "now",
      lane: "user",
    });
    if (sent) markSent("user");
  }

  // --- Daily Idle Check-in (at most one per day, in user's chosen window) ---
  const checkInRefusal = refusal("user", "normal");
  if (!checkInConfig.enabled) {
    console.log(`[Push][CheckIn] skip user=${userId} reason=disabled`);
  } else if (checkInRefusal) {
    console.log(`[Push][CheckIn] skip user=${userId} reason=${checkInRefusal}`);
  } else if (await hasBeenNotifiedToday(userId, checkInDedupKey, timezone)) {
    console.log(`[Push][CheckIn] skip user=${userId} reason=already_notified_today`);
  } else {
    const status =
      checkInConfig.window === "morning"
        ? await shouldSendIdleCheckin(userId, timezone)
        : checkInConfig.window === "afternoon"
          ? await shouldSendAfternoonCheckin(userId, timezone)
          : await getEveningCheckinStatus(userId, timezone);
    if (!status.shouldSend) {
      console.log(`[Push][CheckIn] skip user=${userId} reason=outside_window_or_not_due window=${checkInConfig.window}`);
    } else {
      const locName = await getLocationName();
      const topTask = await getTopPendingTask(userId, locName);
      const messageType =
        checkInConfig.window === "morning"
          ? "idle_checkin"
          : checkInConfig.window === "afternoon"
            ? "idle_checkin_afternoon"
            : "idle_checkin_evening";
      const message = await generatePushMessage(
        { type: messageType, topTask, activityLevel: status.activityLevel },
        personalityPrefs,
        timezone,
        mode,
        locName,
        await getSnapshot()
      );
      const sent = await sendPushToUser(userId, {
        title: "ControlledChaos",
        body: message,
        url: topTask ? "/tasks" : "/dump",
        tag: checkInDedupKey,
        userId,
        actions: IDLE_ACTIONS,
        lane: "user",
      });
      if (sent) {
        markSent("user", "normal");
        console.log(`[Push][CheckIn] sent user=${userId} window=${checkInConfig.window}`);
      }
    }
  }

  // --- Inactivity Nudge ---
  const nudgeRefusal = refusal("app", "normal");
  if (nudgeRefusal && nudgeRefusal !== "quiet_hours") {
    console.log(`[Push][Nudge] skip user=${userId} reason=${nudgeRefusal} appSentToday=${appSentToday} cap=${dailyCap}`);
  }
  const nudge = nudgeRefusal ? null : await getInactivityNudgeTier(userId, timezone);
  if (nudge) {
    const nudgeDedupKey = `nudge-tier-${nudge.tier}-${nudge.streakKey}`;
    if (!(await hasEverBeenNotified(userId, nudgeDedupKey))) {
      const message = await generateNudgeMessage(
        nudge.tier,
        nudge.hoursInactive,
        personalityPrefs,
        timezone,
        mode,
        await getLocationName(),
        await getSnapshot()
      );
      const sent = await sendPushToUser(userId, {
        title: "ControlledChaos",
        body: message,
        url: "/tasks",
        tag: nudgeDedupKey,
        userId,
        lane: "app",
      });
      if (sent) markSent("app", "normal");
    }
  }

  // --- Crisis Detection ---
  if (crisisDetectionTier !== "off") {
    try {
      const crisisResult = await runCrisisDetection({
        userId,
        timezone,
        tier: crisisDetectionTier,
        personalityPrefs,
        notificationPrefs,
        assertivenessMode: mode,
        getSnapshot,
        getLocationName,
        canSendAppPush: () => refusal("app", "high") === null,
      });
      if (crisisResult.notificationSent) markSent("app");
    } catch (err) {
      console.error(`[CrisisDetection] Error for user=${userId}:`, err);
    }
  }

  return userSent;
}

/**
 * POST /api/cron/push-triggers
 * Triggered by a QStash schedule (falls back to CRON_SECRET bearer auth for manual/local calls).
 * Checks all push-enabled users for deadline reminders, event reminders, scheduled task alerts,
 * a single daily idle check-in (at the user's chosen window), inactivity nudges, and pending snoozed pushes.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!(await verifyCronRequest(request, rawBody))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();

  try {
    // --- Fire snoozed pushes (not per-user — check the whole table) ---
    const snoozed = await getPendingSnoozedPushes();
    let totalSent = 0;
    let userFailures = 0;

    for (const item of snoozed) {
      const p = item.payload as { title: string; body: string; url?: string; tag?: string };
      const sent = await sendPushToUser(item.userId, {
        title: p.title,
        body: p.body,
        url: p.url,
        tag: p.tag ? `${p.tag}-snoozed` : undefined,
        userId: item.userId,
        actions: TASK_ACTIONS,
        bypassQuietHours: false,
        // A snooze is the user asking to be reminded again at a time they
        // chose, so it's user-lane: never capped, never counted. It fires
        // outside the per-user loop, so it doesn't spend a tick budget either.
        lane: "user",
      });
      if (sent) {
        await markSnoozedPushSent(item.id);
        totalSent++;
      }
    }

    // --- Per-user triggers (chunked parallel) ---
    const users = await getAllUsersWithPushEnabled();

    for (let i = 0; i < users.length; i += USER_CONCURRENCY) {
      const chunk = users.slice(i, i + USER_CONCURRENCY);
      const results = await Promise.allSettled(chunk.map(processUser));
      for (let j = 0; j < results.length; j++) {
        const r = results[j];
        if (r.status === "fulfilled") {
          totalSent += r.value;
        } else {
          userFailures++;
          console.error(`[Push] user=${chunk[j].userId} failed:`, r.reason);
        }
      }
    }

    const durationMs = Date.now() - startedAt;
    console.log(
      `[Cron][push-triggers] users=${users.length} sent=${totalSent} snoozed=${snoozed.length} failures=${userFailures} durationMs=${durationMs}`
    );

    return NextResponse.json({
      success: true,
      usersChecked: users.length,
      snoozedFired: snoozed.length,
      notificationsSent: totalSent,
      userFailures,
      durationMs,
    });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    console.error(`[Cron] push-triggers error after ${durationMs}ms:`, error);
    return NextResponse.json({ error: "Cron job failed" }, { status: 500 });
  }
}

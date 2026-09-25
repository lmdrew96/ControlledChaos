import { NextResponse } from "next/server";
import {
  getAllUsersWithPushEnabled,
  getPendingSnoozedPushes,
  markSnoozedPushSent,
  deleteSnoozedPush,
  type SnoozedPushPayload,
  getUserLocation,
  isLocationStale,
  getScheduledSessionsInRange,
  getCalendarEventsByDateRange,
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
  buildDigestBody,
  type WakeSummaryItem,
} from "@/lib/notifications/wake-summary";
import {
  getDeadlineReminders,
  getTargetReminders,
  getEventReminders,
  getDailyPushCap,
  getAssertivenessMode,
  getScheduledTaskAlerts,
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
  recordDroppedAlert,
  getInactivityNudgeTier,
  generateNudgeMessage,
  generatePushMessage,
  getTopPendingTask,
  type AlertingTaskDetail,
  type PushNotificationContext,
  type PushSkipReason,
} from "@/lib/notifications/triggers";
import {
  clusterAlerts,
  extractCourseCode,
  type ClusterableAlert,
} from "@/lib/notifications/cluster";
import { buildUserSnapshot } from "@/lib/context/user-snapshot";
import { runCrisisDetection } from "@/lib/crisis-detection/cron-handler";
import { verifyCronRequest } from "@/lib/cron-auth";

// Per-chunk concurrency for the per-user loop. AI message generation is the
// dominant cost per user; ~10 in-flight stays well below Anthropic rate
// limits. On Workers the limit is CPU time, not wall-clock, so time spent
// waiting on Neon/Anthropic is free; concurrency just shortens the tick.
const USER_CONCURRENCY = 10;

// A snoozed push that couldn't go out within this long after its time is dropped.
const SNOOZE_EXPIRY_MS = 15 * 60 * 1000;

const TASK_ACTIONS = [
  { action: "start_task", title: "▶ Start" },
  { action: "snooze", title: "⏰ Snooze 30 min" },
];

const IDLE_ACTIONS = [
  { action: "brain_dump", title: "✏ Brain Dump" },
  { action: "see_tasks", title: "📋 See Tasks" },
];

const EVENT_ACTIONS = [
  { action: "see_calendar", title: "📅 View" },
];

type PushUser = Awaited<ReturnType<typeof getAllUsersWithPushEnabled>>[number];

/**
 * How long after its band opens a reminder can still go out: one 10-minute
 * cron tick plus slack for a late or retried tick. After that it's dropped,
 * never queued (see "One chance per alert" in processUser).
 */
const ONE_CHANCE_MINUTES = 15;

/** Who a push is for: see refusal() in processUser. */
type PushLane = "user" | "app";

/** Why a push was held back this tick. Logged verbatim, so keep it honest. */
type SkipReason = PushSkipReason;

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
  // A subscription can outlive the user turning push off. Skip them before
  // any AI copy is generated; sendPushToUser would refuse every send anyway.
  if (notificationPrefs && !notificationPrefs.pushEnabled) return 0;
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
  let _snapshot: { formatted: string; scheduleOnly: string } | undefined;
  let _snapshotFetched = false;
  const loadSnapshot = async () => {
    if (!_snapshotFetched) {
      try {
        _snapshot = await buildUserSnapshot(userId);
      } catch (err) {
        console.error(`[Push] snapshot failed for user=${userId}:`, err);
      }
      _snapshotFetched = true;
    }
    return _snapshot;
  };
  // Full context (tasks included) for check-ins, nudges and crisis.
  const getSnapshot = async () => (await loadSnapshot())?.formatted;
  // Reminders get the day's shape only. With the task list in view the model
  // attached unrelated homework tips to class reminders and second-guessed
  // work the user had already planned.
  const getReminderSnapshot = async () => (await loadSnapshot())?.scheduleOnly;

  // Per-tick budgets. Without them, every reminder that became eligible during
  // quiet hours fires in the same tick the moment quiet hours end — the
  // "bombarded at wake time" bug. Nothing refused here waits for the next
  // tick (that retry is what put pushes on the cron's 10-minute beat): the
  // check-in folds into the push already going out, reminders are dropped
  // once past their moment, and app-lane pushes are recorded as dropped
  // (recordDroppedAlert). The overnight backlog is folded into the wake-up
  // summary below.
  //
  // High-priority alerts used to skip this AND the daily cap entirely, which
  // is how a single class-plus-homework hour produced an unbounded burst: at
  // <=60 min everything is high-priority, so nothing was holding it back. They
  // now get their own (larger) budget and respect the user's assertiveness cap.
  const NORMAL_PUSH_TICK_BUDGET = 1;
  const HIGH_PUSH_TICK_BUDGET = 2;
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

  // Check-in status, computed at most once per tick. Needed early so a
  // check-in due this tick can fold into whatever push goes out first.
  let _checkInStatus: { shouldSend: boolean; activityLevel: "active" | "idle" } | undefined;
  const getCheckInStatus = async () => {
    _checkInStatus ??=
      checkInConfig.window === "morning"
        ? await shouldSendIdleCheckin(userId, timezone)
        : checkInConfig.window === "afternoon"
          ? await shouldSendAfternoonCheckin(userId, timezone)
          : await getEveningCheckinStatus(userId, timezone);
    return _checkInStatus;
  };

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
    // The app's own pushes never ride along behind another one in the same
    // tick: two at once is the burst, one ten minutes later is the beat.
    if (lane === "app" && userSent > 0) return "tick_budget";
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

  // If the check-in is due this tick, the first push that goes out carries
  // its key: that push is the check-in's moment, and a second push in the
  // same tick would be the burst (the next tick, the beat).
  let _checkInFolded: string[] | undefined;
  const checkInFoldKeys = async (): Promise<string[]> => {
    if (_checkInFolded) return _checkInFolded;
    const due =
      checkInConfig.enabled &&
      !notified.today.has(checkInDedupKey) &&
      (await getCheckInStatus()).shouldSend;
    _checkInFolded = due ? [checkInDedupKey] : [];
    return _checkInFolded;
  };

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
    // Everything due today folds in, the close-in alerts too: sending them
    // separately in the same tick is two pushes at once. Start-now cues fold
    // as keys only — the sittings list below already names them.
    const foldable = fresh.filter((c) => c.at < endOfToday);
    const [sittings, todaysEvents] = await Promise.all([
      getScheduledSessionsInRange(userId, new Date(), endOfToday),
      // The day's events straight from the calendar, not only the ones with a
      // pending reminder: recurring classes get no day-ahead reminder, and
      // "Today:" should still name them.
      getCalendarEventsByDateRange(userId, new Date(), endOfToday),
    ]);
    const items: WakeSummaryItem[] = [
      ...foldable
        .filter((c) => c.kind !== "scheduled")
        .map((c) => ({
          at: c.at,
          title: c.title,
          kind: c.kind as WakeSummaryItem["kind"],
        })),
      ...sittings.map((t) => ({ at: t.scheduledFor, title: t.title, kind: "session" as const })),
      ...todaysEvents
        .filter((e) => !e.isAllDay)
        .map((e) => ({ at: new Date(e.startTime), title: e.title, kind: "event" as const })),
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
          ...(replacesCheckIn ? [checkInDedupKey] : await checkInFoldKeys()),
        ],
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

  // --- One chance per alert: no queue ---
  //
  // Every alert gets exactly one chance, the tick it comes due. Holding the
  // rest for "the next tick" is what turned unrelated alerts into a drip on
  // the cron's 10-minute beat (8:00, 8:10, 8:20, 8:30), and a band stayed
  // eligible for hours, so held alerts also went out late ("CGSC 170 starts
  // tomorrow" at 8:10 PM for a band that opened at 12:40 PM). Anything past
  // its moment is dropped; the next closer band still fires. Runs AFTER the
  // wake-up summary, which is where the ones held overnight land.
  const nowMs = Date.now();
  fresh = fresh.filter((c) => {
    if (c.intervalMinutes === undefined) return true;
    const bandOpenedMs = c.at.getTime() - c.intervalMinutes * 60_000;
    return nowMs - bandOpenedMs <= ONE_CHANCE_MINUTES * 60_000;
  });

  fresh.sort((a, b) => a.at.getTime() - b.at.getTime());

  // Quiet hours hold everything (none of these opt out); the wake-up summary
  // collects what's still relevant when they end.
  const due = clusterAlerts(fresh).filter(
    (c) => !quietHoursActive || [c.primary, ...c.absorbed].some((m) => m.bypassQuietHours)
  );

  if (due.length === 1) {
    // One situation: a written push, as before.
    const { primary, absorbed, dedupKeys } = due[0];
    const members = [primary, ...absorbed];
    const priority = members.some((m) => m.priority === "high") ? "high" : "normal";
    const message = await generatePushMessage(
      buildClusterContext(primary, absorbed),
      personalityPrefs,
      timezone,
      mode,
      await getLocationName(),
      await getReminderSnapshot()
    );
    const sent = await sendPushToUser(userId, {
      title: "ControlledChaos",
      body: message,
      url: primary.url,
      tag: primary.dedupKey,
      dedupKeys: [...dedupKeys, ...(await checkInFoldKeys())],
      taskId: primary.taskId,
      actions: primary.actions,
      bypassQuietHours: members.some((m) => m.bypassQuietHours),
      lane: "user",
    });
    if (sent) {
      markSent("user", priority);
      if (absorbed.length > 0) {
        console.log(
          `[Push][Cluster] user=${userId} merged=${members.length} primary=${primary.kind} absorbed=${absorbed.map((a) => a.kind).join(",")}`
        );
      }
    }
  } else if (due.length > 1) {
    // Several unrelated things came due at once: ONE push listing them, built
    // from data. Blending unrelated items into one written sentence is where
    // the model pairs times wrong, and spreading them out is the drip.
    const members = due.flatMap((c) => [c.primary, ...c.absorbed]);
    const sent = await sendPushToUser(userId, {
      title: "ControlledChaos",
      body: buildDigestBody(
        members.map((m) => ({
          at: m.at,
          title: m.title,
          kind: m.kind === "scheduled" ? ("session" as const) : m.kind,
        })),
        timezone,
        { heading: "Coming up", now: new Date(nowMs) }
      ),
      url: "/calendar",
      tag: due[0].primary.dedupKey,
      dedupKeys: [...due.flatMap((c) => c.dedupKeys), ...(await checkInFoldKeys())],
      actions: EVENT_ACTIONS,
      lane: "user",
    });
    if (sent) {
      markSent("user", members.some((m) => m.priority === "high") ? "high" : "normal");
      console.log(`[Push][Batch] user=${userId} situations=${due.length} items=${members.length}`);
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
      await getReminderSnapshot()
    );
    const sent = await sendPushToUser(userId, {
      title: "ControlledChaos",
      body: message,
      url: "/calendar",
      tag: dedupKey,
      dedupKeys: [dedupKey, ...(await checkInFoldKeys())],
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
    const status = await getCheckInStatus();
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
  // Quiet hours hold a nudge; any other refusal drops it (one chance), so it
  // can't land on a later tick just because this one was taken.
  const nudgeRefusal = refusal("app", "normal");
  const nudge = nudgeRefusal === "quiet_hours" ? null : await getInactivityNudgeTier(userId, timezone);
  if (nudge) {
    const nudgeDedupKey = `nudge-tier-${nudge.tier}-${nudge.streakKey}`;
    // hasEverBeenNotified also covers a nudge dropped within the last day.
    if (await hasEverBeenNotified(userId, nudgeDedupKey)) {
      // handled
    } else if (nudgeRefusal) {
      console.log(`[Push][Nudge] drop user=${userId} reason=${nudgeRefusal} appSentToday=${appSentToday} cap=${dailyCap}`);
      await recordDroppedAlert(userId, [nudgeDedupKey], nudgeRefusal);
    } else {
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
        lane: "app",
      });
      if (sent) markSent("app", "normal");
      else await recordDroppedAlert(userId, [nudgeDedupKey], "send_refused");
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
        appPushRefusal: () => refusal("app", "high"),
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
      // A snooze is one more chance, not a standing order. Past the window
      // (a refused send, a missed tick) or once the task is done, it's gone —
      // "starts in 10 min" hours later, after the fact, is worse than nothing.
      const expired = startedAt > item.sendAfter.getTime() + SNOOZE_EXPIRY_MS;
      const p = item.payload as SnoozedPushPayload;
      const taskGone =
        "taskId" in p &&
        (item.taskTitle === null || item.taskDeletedAt !== null || item.taskStatus === "completed");
      if (expired || taskGone) {
        await deleteSnoozedPush(item.id);
        continue;
      }

      // Fresh copy from the task: the original body was written for the
      // original moment ("starts in 10 min") and is stale by now.
      const payload =
        "taskId" in p
          ? {
              title: item.taskTitle ?? "Snoozed reminder",
              body: "Back, like you asked. Ready for it now?",
              url: `/tasks?taskId=${p.taskId}`,
              taskId: p.taskId,
            }
          : { title: p.title, body: p.body, url: p.url };

      const sent = await sendPushToUser(item.userId, {
        ...payload,
        tag: p.tag ? `${p.tag}-snoozed` : undefined,
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

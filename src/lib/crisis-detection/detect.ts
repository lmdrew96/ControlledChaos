/**
 * Crisis detection engine — pure function, no side effects.
 *
 * Feasibility is evaluated at EACH distinct task deadline within the window
 * (not just the earliest one): each checkpoint sums required minutes for
 * tasks due at-or-before it, against the time available up to that same
 * point. The worst (highest-ratio) checkpoint is the reported crisis —
 * this stops a task due tomorrow from inflating the ratio for a task due
 * tonight. `firstDeadline` on the result is that worst checkpoint's
 * deadline, since that's the deadline the crisis (and any rescue plan)
 * actually needs to be built around.
 *
 *   crisis_ratio = required_minutes / available_minutes   (at the worst checkpoint)
 *
 * A crisis is detected when EITHER is true:
 *   1. ratio > 1.0 (more work than time)
 *   2. ratio > 0.8 with 2+ distinct deadlines across the at-risk workload
 *
 * TWO TIERS. The above is the HARD tier — a real emergency against real
 * deadlines, and its behavior is unchanged. When it does not fire, the same
 * math runs a second time against SOFT self-imposed targets, producing a
 * `drift` result: "you're falling behind your own plan", with days of slack
 * still behind it. A runway instead of a cliff.
 *
 * Drift is NEVER a crisis. It must not reach the crisis UI or crisis-toned
 * copy — missing a target you set yourself has no external consequence.
 */

import { getAvailableMinutes } from "./time-math";
import type { CrisisDetectionResult, MomentType } from "@/types";

// ============================================================
// Input types
// ============================================================

export interface DetectionTask {
  id: string;
  title: string;
  /** HARD deadline, or null for a task that only carries a soft target. */
  deadline: Date | null;
  estimatedMinutes: number;
  status: string;
  /**
   * SOFT self-imposed target, when the task has one. Used only by the drift
   * tier — it never affects hard crisis detection.
   */
  targetDate?: Date | null;
}

export interface DetectionCalendarEvent {
  startTime: Date;
  endTime: Date;
  isAllDay: boolean;
}

export interface DetectionMoment {
  type: MomentType;
  intensity: number | null;
  occurredAt: Date;
}

export interface CrisisDetectionInput {
  /** Pending/in-progress tasks with deadlines and time estimates */
  tasks: DetectionTask[];
  /** Calendar events in the detection window */
  calendarEvents: DetectionCalendarEvent[];
  /** User's timezone */
  timezone: string;
  /** Hour user wakes up (0-23, default 7) */
  wakeTime: number;
  /** Hour user goes to sleep (0-23, default 22) */
  sleepTime: number;
  /** How far ahead to look in hours (default 48) */
  detectionWindowHours?: number;
  /**
   * Recent Moments (default: empty). Used to AUGMENT detection with
   * explicit user-reported state signals — never replaces the base logic.
   * When empty, detection behaves exactly as before.
   */
  recentMoments?: DetectionMoment[];
  /**
   * Whether a drift warning is currently standing for this user.
   *
   * Feeds the hysteresis band: once drift is reported it takes a meaningfully
   * better ratio to clear it, so a workload hovering at the threshold can't
   * flip the warning on and off every tick.
   */
  driftActive?: boolean;
}

// ============================================================
// Detection thresholds
// ============================================================

const DEFAULT_DETECTION_WINDOW_HOURS = 48;
const CRISIS_RATIO_HARD = 1.0;      // More work than available time
const CRISIS_RATIO_SOFT = 0.8;      // Tight but maybe doable — crisis only with 2+ deadlines
const MIN_CONFLICTING_DEADLINES = 2; // Required for soft threshold
const MIN_TASK_MINUTES_FOR_CRISIS = 5; // Quick errands ("grab X from car") aren't crisis-shaped work

/**
 * Drift tier. Same shape as the hard tier, one step earlier.
 *
 * DRIFT_HYSTERESIS is the whole flicker guard: drift STARTS above
 * CRISIS_RATIO_SOFT but only CLEARS below (CRISIS_RATIO_SOFT - hysteresis).
 * Without the gap, a ratio sitting near 0.8 — which is exactly where a busy
 * week sits — would alternate warn/clear on every cron tick.
 */
const DRIFT_RATIO = CRISIS_RATIO_SOFT;
const DRIFT_HYSTERESIS = 0.1;
const MIN_DRIFT_TARGETS = 2;

// Moment augmentation thresholds
const TOUGH_MOMENT_OVERRIDE_MINUTES = 60;   // Rule 1 window
const TOUGH_MOMENT_OVERRIDE_INTENSITY = 4;  // ≥ this intensity triggers override
const CRISIS_RATIO_MOMENT_OVERRIDE = 0.6;   // Ratio floor when override fires
const CONSECUTIVE_TOUGH_WINDOW_MINUTES = 120; // Rule 2 window
const CONSECUTIVE_TOUGH_COUNT = 2;
const ENERGY_CRASH_BIAS_MINUTES = 30;       // Rule 3 window
const ENERGY_CRASH_BIAS = 0.1;              // Additive bias for threshold comparison only

// ============================================================
// Core detection
// ============================================================


/**
 * Feasibility at each distinct checkpoint, returning the worst one.
 *
 * `when` picks which of a task's times the checkpoint is built from, so the
 * hard tier can sweep deadlines and the drift tier can sweep soft targets
 * without two copies of this arithmetic drifting apart.
 */
function worstCheckpoint(
  tasks: DetectionTask[],
  when: (task: DetectionTask) => Date,
  calendarEvents: DetectionCalendarEvent[],
  wakeTime: number,
  sleepTime: number,
  now: Date,
  timezone: string
) {
  const distinct = Array.from(new Set(tasks.map((t) => when(t).getTime()))).sort(
    (a, b) => a - b
  );

  let at = new Date(distinct[0]);
  let requiredMinutes = 0;
  let availableMinutes = 0;
  let ratio = -Infinity;
  let tasksAtWorst = tasks;

  for (const ts of distinct) {
    const checkpoint = new Date(ts);
    const dueByCheckpoint = tasks.filter((t) => when(t).getTime() <= ts);
    const checkpointRequired = dueByCheckpoint.reduce(
      (sum, t) => sum + t.estimatedMinutes,
      0
    );
    const checkpointAvailable = getAvailableMinutes(
      calendarEvents,
      wakeTime,
      sleepTime,
      now,
      checkpoint,
      timezone
    );
    const checkpointRatio =
      checkpointAvailable <= 0 ? Infinity : checkpointRequired / checkpointAvailable;

    if (checkpointRatio > ratio) {
      ratio = checkpointRatio;
      requiredMinutes = checkpointRequired;
      availableMinutes = checkpointAvailable;
      at = checkpoint;
      tasksAtWorst = dueByCheckpoint;
    }
  }

  // Crowding signal: how many distinct hours are converging, across the whole
  // workload rather than just the worst checkpoint.
  const distinctHours = new Set(
    tasks.map((t) => when(t).toISOString().slice(0, 13)) // "YYYY-MM-DDTHH"
  ).size;

  return { at, requiredMinutes, availableMinutes, ratio, tasksAtWorst, distinctHours };
}

/**
 * Analyze tasks and calendar to detect a potential crisis.
 * Returns null if no crisis condition exists.
 */
export function detectCrisis(input: CrisisDetectionInput): CrisisDetectionResult | null {
  const {
    tasks,
    calendarEvents,
    timezone,
    wakeTime,
    sleepTime,
    detectionWindowHours = DEFAULT_DETECTION_WINDOW_HOURS,
    recentMoments = [],
  } = input;

  const now = new Date();
  const windowEnd = new Date(now.getTime() + detectionWindowHours * 60 * 60 * 1000);

  // Filter to actionable tasks with deadlines in the detection window
  const atRiskTasks = tasks.filter((t) => {
    if (t.status !== "pending" && t.status !== "in_progress") return false;
    if (!t.deadline || !t.estimatedMinutes) return false;
    if (t.estimatedMinutes < MIN_TASK_MINUTES_FOR_CRISIS) return false;
    return t.deadline > now && t.deadline <= windowEnd;
  });

  // No qualifying HARD deadlines. That rules out a crisis, not drift: a task
  // carrying only a soft target never reaches this filter, and the drift tier
  // exists precisely for that case.
  if (atRiskTasks.length === 0) return detectDrift(input, now, windowEnd);

  // Sort by deadline ascending
  atRiskTasks.sort((a, b) => (a.deadline as Date).getTime() - (b.deadline as Date).getTime());

  // Evaluate feasibility at EACH distinct deadline, not just the earliest one.
  // A task due tomorrow afternoon must not count against the available-time
  // budget for a task due tonight — each checkpoint only sums the minutes for
  // tasks due at-or-before it, matched against the time available up to that
  // same point. The worst (highest-ratio) checkpoint is the real crisis.
  const hard = worstCheckpoint(
    atRiskTasks,
    (t) => t.deadline as Date,
    calendarEvents,
    wakeTime,
    sleepTime,
    now,
    timezone
  );

  const {
    at: firstDeadline,
    requiredMinutes,
    availableMinutes,
    ratio: crisisRatio,
    tasksAtWorst: tasksAtWorstCheckpoint,
    distinctHours: deadlineCount,
  } = hard;

  // ============================================================
  // Moment augmentation — explicit user-reported state signals
  // Augment, never replace. recentMoments empty => base behavior.
  // ============================================================
  const msSinceMoment = (m: DetectionMoment) =>
    now.getTime() - m.occurredAt.getTime();

  // Rule 1: tough_moment with intensity ≥ 4 in the last 60 min → override to
  // a lower ratio floor so we trigger earlier.
  const toughOverride = recentMoments.some(
    (m) =>
      m.type === "tough_moment" &&
      (m.intensity ?? 0) >= TOUGH_MOMENT_OVERRIDE_INTENSITY &&
      msSinceMoment(m) <= TOUGH_MOMENT_OVERRIDE_MINUTES * 60 * 1000
  );

  // Rule 2: ≥ 2 tough_moment events in the last 2 hours → same override.
  const consecutiveTough =
    recentMoments.filter(
      (m) =>
        m.type === "tough_moment" &&
        msSinceMoment(m) <= CONSECUTIVE_TOUGH_WINDOW_MINUTES * 60 * 1000
    ).length >= CONSECUTIVE_TOUGH_COUNT;

  // Rule 3: energy_crash in the last 30 min → bias the ratio upward for
  // threshold comparison only (the stored crisis_ratio stays the real value).
  const energyCrashBias = recentMoments.some(
    (m) =>
      m.type === "energy_crash" &&
      msSinceMoment(m) <= ENERGY_CRASH_BIAS_MINUTES * 60 * 1000
  )
    ? ENERGY_CRASH_BIAS
    : 0;

  const effectiveRatio = crisisRatio + energyCrashBias;
  const momentOverride = toughOverride || consecutiveTough;

  // Detection conditions
  const hardThresholdMet = effectiveRatio > CRISIS_RATIO_HARD;
  const softThresholdMet =
    effectiveRatio > CRISIS_RATIO_SOFT && deadlineCount >= MIN_CONFLICTING_DEADLINES;
  const momentThresholdMet =
    momentOverride && effectiveRatio > CRISIS_RATIO_MOMENT_OVERRIDE;

  if (!hardThresholdMet && !softThresholdMet && !momentThresholdMet) {
    // No emergency. Look one step earlier: are they drifting behind the
    // targets they set for themselves? A warning tier with runway behind it.
    return detectDrift(input, now, windowEnd);
  }

  return {
    detected: true,
    severity: "crisis",
    crisisRatio: crisisRatio === Infinity ? 999 : Math.round(crisisRatio * 1000) / 1000,
    availableMinutes,
    requiredMinutes,
    involvedTaskIds: tasksAtWorstCheckpoint.map((t) => t.id),
    involvedTaskNames: tasksAtWorstCheckpoint.map((t) => t.title),
    firstDeadline,
  };
}

/**
 * The soft tier: the same feasibility math, run against SOFT self-imposed
 * targets instead of hard deadlines.
 *
 * Deliberately quieter than the hard tier in three ways:
 *  - It never applies the Moment augmentation rules. Those exist to catch an
 *    emergency earlier; a tough moment should not escalate a date the user
 *    set for themselves and is free to move.
 *  - It always requires MIN_DRIFT_TARGETS converging targets. A single target
 *    running tight is just a plan needing a nudge, not a pattern.
 *  - It has a hysteresis band, so it cannot flicker on and off around 0.8.
 */
function detectDrift(
  input: CrisisDetectionInput,
  now: Date,
  windowEnd: Date
): CrisisDetectionResult | null {
  const { tasks, calendarEvents, timezone, wakeTime, sleepTime, driftActive = false } = input;

  const driftingTasks = tasks.filter((t) => {
    if (t.status !== "pending" && t.status !== "in_progress") return false;
    if (!t.targetDate || !t.estimatedMinutes) return false;
    if (t.estimatedMinutes < MIN_TASK_MINUTES_FOR_CRISIS) return false;
    return t.targetDate > now && t.targetDate <= windowEnd;
  });

  if (driftingTasks.length === 0) return null;

  const drift = worstCheckpoint(
    driftingTasks,
    (t) => t.targetDate as Date,
    calendarEvents,
    wakeTime,
    sleepTime,
    now,
    timezone
  );

  // The band: warn above DRIFT_RATIO, but once warned, stay warned until the
  // ratio drops a clear step below it. Without the gap a workload parked near
  // the threshold alternates warn/clear on every tick.
  const threshold = driftActive ? DRIFT_RATIO - DRIFT_HYSTERESIS : DRIFT_RATIO;

  if (drift.ratio <= threshold) return null;
  if (drift.distinctHours < MIN_DRIFT_TARGETS) return null;

  return {
    detected: true,
    severity: "drift",
    crisisRatio: drift.ratio === Infinity ? 999 : Math.round(drift.ratio * 1000) / 1000,
    availableMinutes: drift.availableMinutes,
    requiredMinutes: drift.requiredMinutes,
    involvedTaskIds: drift.tasksAtWorst.map((t) => t.id),
    involvedTaskNames: drift.tasksAtWorst.map((t) => t.title),
    firstDeadline: drift.at,
  };
}

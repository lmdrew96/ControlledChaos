/**
 * Crisis detection engine — pure function, no side effects.
 *
 * Calculates the ratio of required work time to available time and determines
 * whether a crisis condition exists. The detection algorithm:
 *
 *   crisis_ratio = required_minutes / available_minutes
 *
 * A crisis is detected when BOTH are true:
 *   1. ratio > 1.0 (more work than time) OR ratio > 0.8 with 2+ conflicting deadlines
 *   2. First deadline is within the detection window (default 48 hours)
 */

import { getAvailableMinutes } from "./time-math";
import type { CrisisDetectionResult, MomentType } from "@/types";

// ============================================================
// Input types
// ============================================================

export interface DetectionTask {
  id: string;
  title: string;
  deadline: Date;
  estimatedMinutes: number;
  status: string;
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
}

// ============================================================
// Detection thresholds
// ============================================================

const DEFAULT_DETECTION_WINDOW_HOURS = 48;
const CRISIS_RATIO_HARD = 1.0;      // More work than available time
const CRISIS_RATIO_SOFT = 0.8;      // Tight but maybe doable — crisis only with 2+ deadlines
const MIN_CONFLICTING_DEADLINES = 2; // Required for soft threshold

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
    if (t.estimatedMinutes <= 0) return false;
    return t.deadline > now && t.deadline <= windowEnd;
  });

  // No qualifying tasks — no crisis
  if (atRiskTasks.length === 0) return null;

  // Sort by deadline ascending
  atRiskTasks.sort((a, b) => a.deadline.getTime() - b.deadline.getTime());

  const firstDeadline = atRiskTasks[0].deadline;
  const requiredMinutes = atRiskTasks.reduce((sum, t) => sum + t.estimatedMinutes, 0);

  // Calculate available time from now to the first deadline
  const availableMinutes = getAvailableMinutes(
    calendarEvents,
    wakeTime,
    sleepTime,
    now,
    firstDeadline,
    timezone
  );

  // Compute crisis ratio (guard against zero available time)
  const crisisRatio = availableMinutes <= 0 ? Infinity : requiredMinutes / availableMinutes;

  // Count distinct deadline timestamps (grouped by hour to avoid minute-level splits)
  const uniqueDeadlines = new Set(
    atRiskTasks.map((t) => t.deadline.toISOString().slice(0, 13)) // "YYYY-MM-DDTHH"
  );
  const deadlineCount = uniqueDeadlines.size;

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

  if (!hardThresholdMet && !softThresholdMet && !momentThresholdMet) return null;

  return {
    detected: true,
    crisisRatio: crisisRatio === Infinity ? 999 : Math.round(crisisRatio * 1000) / 1000,
    availableMinutes,
    requiredMinutes,
    involvedTaskIds: atRiskTasks.map((t) => t.id),
    involvedTaskNames: atRiskTasks.map((t) => t.title),
    firstDeadline,
  };
}

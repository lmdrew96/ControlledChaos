import {
  DEFAULT_DEADLINE_REMINDER_INTERVALS,
  DEFAULT_EVENT_REMINDER_INTERVALS,
  type NotificationPrefs,
} from "@/types";

/** Which kind of reminder a schedule applies to. */
export type ReminderKind = "deadline" | "event";

/**
 * Pure — no DB, no server deps — so the settings UI and the push cron resolve
 * a user's schedule the same way instead of each reimplementing it.
 */

/** Unique positive whole minutes, sorted descending. */
export function sortIntervalsDesc(list: number[]): number[] {
  return Array.from(
    new Set(
      list
        .filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n > 0)
        .map((n) => Math.floor(n))
    )
  ).sort((a, b) => b - a);
}

/**
 * Resolve a user's reminder intervals for one kind of reminder.
 *
 * Deadlines and events are configured separately, but a single shared
 * `reminderIntervals` list predates the split, so resolution walks three
 * levels and stops at the first one the user actually set:
 *
 *   1. The kind-specific list, if set.
 *   2. The legacy shared list, if set — this is what keeps an existing custom
 *      schedule (or an explicit `[]` opt-out) working for both kinds until the
 *      user configures them apart.
 *   3. The default for that kind.
 *
 * `Array.isArray` is the test at every level, so an empty array reads as
 * "explicitly opted out" rather than falling through to the next level.
 */
export function getReminderIntervals(
  prefs: Partial<NotificationPrefs> | null | undefined,
  kind: ReminderKind
): number[] {
  const specific =
    kind === "deadline"
      ? prefs?.deadlineReminderIntervals
      : prefs?.eventReminderIntervals;
  const fallbackDefault =
    kind === "deadline"
      ? DEFAULT_DEADLINE_REMINDER_INTERVALS
      : DEFAULT_EVENT_REMINDER_INTERVALS;

  const source = Array.isArray(specific)
    ? specific
    : Array.isArray(prefs?.reminderIntervals)
      ? prefs.reminderIntervals
      : fallbackDefault;

  return sortIntervalsDesc(source);
}

/**
 * A task can carry up to three independent times, and they are NOT
 * interchangeable (see HARD_SOFT_TIME_RULES in src/lib/ai/prompts.ts):
 *
 * - `deadline`     HARD wall set by the outside world. Missing it has consequences.
 * - `targetDate`   SOFT target the user set for themselves. Theirs to move.
 * - `scheduledFor` when they planned to START. Not a due date of any kind.
 *
 * Anything that asks "when does this task next want my attention?" needs the
 * soonest of the three — but must keep track of WHICH one it found, so it can
 * pick the right tone. This module is that shared answer.
 */

export type TaskTimeKind = "deadline" | "target" | "planned";

export interface TaskTime {
  kind: TaskTimeKind;
  at: Date;
}

export interface TaskTimeFields {
  deadline?: string | Date | null;
  targetDate?: string | Date | null;
  scheduledFor?: string | Date | null;
}

const toDate = (value: string | Date | null | undefined): Date | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * Every time a task carries, soonest first.
 *
 * Ties break toward the harder commitment (deadline > target > planned), so a
 * caller taking the first entry gets the most consequential reading of that instant.
 */
export const getTaskTimes = (task: TaskTimeFields): TaskTime[] => {
  const kindRank: Record<TaskTimeKind, number> = { deadline: 0, target: 1, planned: 2 };

  const times: TaskTime[] = [];
  const deadline = toDate(task.deadline);
  const target = toDate(task.targetDate);
  const planned = toDate(task.scheduledFor);

  if (deadline) times.push({ kind: "deadline", at: deadline });
  if (target) times.push({ kind: "target", at: target });
  if (planned) times.push({ kind: "planned", at: planned });

  return times.sort(
    (a, b) => a.at.getTime() - b.at.getTime() || kindRank[a.kind] - kindRank[b.kind]
  );
};

/** The soonest of a task's three times, or `null` if it has none. */
export const getSoonestTaskTime = (task: TaskTimeFields): TaskTime | null =>
  getTaskTimes(task)[0] ?? null;

/**
 * Sort comparator putting the soonest-claim-on-your-attention first, with
 * tasks that carry no time at all last.
 */
export const compareBySoonestTime = (a: TaskTimeFields, b: TaskTimeFields): number => {
  const aTime = getSoonestTaskTime(a);
  const bTime = getSoonestTaskTime(b);
  if (!aTime && !bTime) return 0;
  if (!aTime) return 1;
  if (!bTime) return -1;
  return aTime.at.getTime() - bTime.at.getTime();
};

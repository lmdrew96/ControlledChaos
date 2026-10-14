/**
 * "What does today look like?" for the dashboard's Today card and the Tasks
 * list's today scope. Today is the user's local calendar day (midnight to
 * midnight), not the wake/sleep window: an assignment due 11:59 PM is due
 * today even if the user's day "ends" at 11.
 *
 * A task lands in one bucket only, the most urgent it qualifies for:
 * overdue > due today > planned today. "Due" is the hard deadline; a sitting
 * is the next one that hasn't ended (nextSessionAt).
 */
import { toDateKeyInTimezone } from "@/lib/timezone";

export type TodayBucket = "overdue" | "due" | "planned";

export interface TodayTaskFields {
  status: string;
  deadline: string | null;
  nextSessionAt?: string | null;
}

const isOpen = (task: TodayTaskFields): boolean =>
  task.status !== "completed" && task.status !== "cancelled";

/** Which Today bucket a task belongs in, or null if today doesn't involve it. */
export const todayBucket = (
  task: TodayTaskFields,
  now: Date,
  timezone: string
): TodayBucket | null => {
  if (!isOpen(task)) return null;
  const todayKey = toDateKeyInTimezone(now, timezone);

  if (task.deadline) {
    const deadline = new Date(task.deadline);
    if (deadline.getTime() < now.getTime()) return "overdue";
    if (toDateKeyInTimezone(deadline, timezone) === todayKey) return "due";
  }
  if (task.nextSessionAt && toDateKeyInTimezone(new Date(task.nextSessionAt), timezone) === todayKey) {
    return "planned";
  }
  return null;
};

export interface TodayBuckets<T> {
  overdue: T[];
  due: T[];
  planned: T[];
}

/** Every task that today involves, bucketed and sorted (oldest/soonest first). */
export const bucketToday = <T extends TodayTaskFields>(
  tasks: T[],
  now: Date,
  timezone: string
): TodayBuckets<T> => {
  const buckets: TodayBuckets<T> = { overdue: [], due: [], planned: [] };
  for (const task of tasks) {
    const bucket = todayBucket(task, now, timezone);
    if (bucket) buckets[bucket].push(task);
  }
  const by = (field: "deadline" | "nextSessionAt") => (a: T, b: T) =>
    new Date(a[field] ?? 0).getTime() - new Date(b[field] ?? 0).getTime();
  buckets.overdue.sort(by("deadline"));
  buckets.due.sort(by("deadline"));
  buckets.planned.sort(by("nextSessionAt"));
  return buckets;
};

/** The open task with the soonest deadline after today, for the empty state. */
export const nextDueAfterToday = <T extends TodayTaskFields>(
  tasks: T[],
  now: Date,
  timezone: string
): T | null => {
  const todayKey = toDateKeyInTimezone(now, timezone);
  let next: T | null = null;
  for (const task of tasks) {
    if (!isOpen(task) || !task.deadline) continue;
    const deadline = new Date(task.deadline);
    if (toDateKeyInTimezone(deadline, timezone) <= todayKey) continue;
    if (!next || deadline < new Date(next.deadline!)) next = task;
  }
  return next;
};

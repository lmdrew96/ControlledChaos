/**
 * Alert clustering — one push per *situation*, not per *record*.
 *
 * The problem this solves: a Canvas course generates several independent
 * alerts that all describe the same moment. A LATN 101 class meeting and the
 * "Long Live Latin" homework due at the start of it are two rows in two
 * tables, but they are one thing happening to the user. Sent separately they
 * arrive as a burst of near-identical notifications.
 *
 * Clustering is deliberately CONSERVATIVE. Alerts are grouped only when
 * there's positive evidence they're the same situation:
 *   1. An explicit link — a task generated from a calendar event carries that
 *      event's external id in `sourceEventId`.
 *   2. A shared course code within a time window.
 *
 * Notably we do NOT group on time proximity alone. A dentist appointment and
 * an essay deadline that happen to land in the same hour are two unrelated
 * things, and blending them into one message costs more in predictability
 * than it saves in interruptions.
 */

/** Where an alert came from. Also the tie-break order for picking a primary. */
export type AlertKind =
  | "deadline"
  | "target"
  | "scheduled"
  | "event";

/**
 * Preference order when choosing which alert speaks for a cluster.
 * Task-shaped alerts outrank events: a task carries an actionable deep link
 * and ▶ Start / ⏰ Snooze buttons, which a bare event reminder does not. The
 * event still gets mentioned — it's absorbed into the message body.
 */
const KIND_RANK: Record<AlertKind, number> = {
  deadline: 0,
  // A soft target ranks below a hard deadline on purpose: when both land in one
  // cluster, the deadline must be the voice, or a real due date gets described
  // in the gentle register reserved for a date the user set for themselves.
  target: 1,
  scheduled: 2,
  event: 3,
};

export interface ClusterableAlert {
  kind: AlertKind;
  /** Stable identity for dedup. Recorded for every member of a sent cluster. */
  dedupKey: string;
  /** The moment this alert is about (deadline, event start, scheduled start). */
  at: Date;
  /** Display title — the task or event name. */
  title: string;
  /** Course code (e.g. "LATN101") if one could be extracted. */
  courseCode: string | null;
  /** For tasks generated from a calendar event: that event's external id. */
  sourceEventId?: string | null;
  /** For calendar events: the external (Canvas) id. */
  externalId?: string | null;
}

export interface AlertCluster<T extends ClusterableAlert> {
  /** The alert that supplies the deep link, action buttons and message shape. */
  primary: T;
  /** Same-situation alerts folded into the primary's message. */
  absorbed: T[];
  /** Every member's dedup key — all must be suppressed once the cluster sends. */
  dedupKeys: string[];
}

/**
 * How far apart two alerts for the same course can be and still count as one
 * situation. Two hours covers "homework due at the start of the class it's
 * for" plus a normal class block, without swallowing a morning lecture and an
 * evening deadline for the same course.
 */
export const CLUSTER_WINDOW_MINUTES = 120;

const CANVAS_TAG_RE = /\[([^\]]+)\]/;
// "LATN101", "LATN 101", "LATN-101" → all normalize to LATN101.
// Case-sensitive on the letters: lowercase prose ("essay 2026") must not
// read as a course code.
const COURSE_CODE_RE = /\b([A-Z]{2,5})[\s-]?(\d{2,4})\b/;

/**
 * Pull a course code out of the first source that yields one.
 *
 * Canvas titles carry a trailing `[26S-LATN101-080]` tag, which is the most
 * reliable signal, so a bracketed tag is checked before the bare string.
 * Auto-generated task descriptions lead with the code ("LATN101 · Due …"),
 * which is why callers pass description as well as title.
 */
export function extractCourseCode(
  ...sources: (string | null | undefined)[]
): string | null {
  for (const source of sources) {
    if (!source) continue;

    const tag = source.match(CANVAS_TAG_RE);
    if (tag) {
      const inTag = tag[1].match(COURSE_CODE_RE);
      if (inTag) return `${inTag[1]}${inTag[2]}`;
    }

    const bare = source.match(COURSE_CODE_RE);
    if (bare) return `${bare[1]}${bare[2]}`;
  }
  return null;
}

/** True if two alerts describe the same situation. */
function sameSituation(a: ClusterableAlert, b: ClusterableAlert): boolean {
  // 1. Explicit link: a task generated from this very calendar event.
  const aLink = a.sourceEventId ?? a.externalId;
  const bLink = b.sourceEventId ?? b.externalId;
  if (aLink && bLink && aLink === bLink) return true;

  // 2. Same course, close enough in time.
  if (a.courseCode && b.courseCode && a.courseCode === b.courseCode) {
    const gapMinutes = Math.abs(a.at.getTime() - b.at.getTime()) / 60_000;
    if (gapMinutes <= CLUSTER_WINDOW_MINUTES) return true;
  }

  return false;
}

/**
 * Two alerts this close together are describing the same moment (homework due
 * at the start of the class it's for), so which one leads is a question of
 * usefulness, not timing. Further apart than this and the sooner one wins
 * regardless of kind — burying an alert that fires in 10 minutes behind a task
 * due in two hours would defeat the point.
 */
export const SAME_MOMENT_MINUTES = 30;

/**
 * Pick the alert that speaks for a cluster.
 *
 * Earliest first, because the nearest thing is what the user needs to act on.
 * Among alerts describing the same moment, the better kind wins: a task
 * carries a deep link and ▶ Start / ⏰ Snooze buttons that a bare event
 * reminder does not, so the task leads and the event is absorbed into its text.
 */
function pickPrimary<T extends ClusterableAlert>(members: T[]): T {
  return members.reduce((best, candidate) => {
    const gapMinutes =
      Math.abs(candidate.at.getTime() - best.at.getTime()) / 60_000;

    if (gapMinutes > SAME_MOMENT_MINUTES) {
      return candidate.at.getTime() < best.at.getTime() ? candidate : best;
    }

    const rankDiff = KIND_RANK[candidate.kind] - KIND_RANK[best.kind];
    if (rankDiff !== 0) return rankDiff < 0 ? candidate : best;
    return candidate.at.getTime() < best.at.getTime() ? candidate : best;
  });
}

/**
 * Group alerts into situations.
 *
 * Grouping is transitive: if a links to b and b links to c, all three land in
 * one cluster even when a and c share no signal directly. Alerts that match
 * nothing come back as single-member clusters, so callers can treat every
 * result the same way.
 *
 * Input order is preserved in the output (clusters are returned in the order
 * their first member appeared) so the caller's urgency sort survives.
 */
export function clusterAlerts<T extends ClusterableAlert>(
  alerts: T[]
): AlertCluster<T>[] {
  const groups: T[][] = [];

  for (const alert of alerts) {
    // An alert can bridge two existing groups — collect every group it
    // matches, then merge them all together rather than joining just the first.
    const matched: number[] = [];
    for (let i = 0; i < groups.length; i++) {
      if (groups[i].some((member) => sameSituation(member, alert))) {
        matched.push(i);
      }
    }

    if (matched.length === 0) {
      groups.push([alert]);
      continue;
    }

    const [keep, ...rest] = matched;
    groups[keep].push(alert);
    // Fold the bridged groups into the first, walking backwards so the
    // splices don't shift indices we still need.
    for (let i = rest.length - 1; i >= 0; i--) {
      groups[keep].push(...groups[rest[i]]);
      groups.splice(rest[i], 1);
    }
  }

  return groups.map((members) => {
    const primary = pickPrimary(members);
    return {
      primary,
      absorbed: members.filter((m) => m !== primary),
      dedupKeys: members.map((m) => m.dedupKey),
    };
  });
}

// ---------------------------------------------------------------------------
// Heads-ups vs moments — one task, several kinds, one day
// ---------------------------------------------------------------------------
//
// Each kind dedups on its own key, and clustering only merges alerts that come
// due together, so one task could collect a target heads-up, a day-out
// deadline, a scheduled start and a close deadline across one morning (PSYC
// 100 got four). Kinds split by what the push is FOR:
//
//   - A heads-up (a target, or a deadline more than an hour out) puts the task
//     on the radar. Once any push about the task has gone out today it's
//     already there, so a later heads-up is dropped.
//   - A moment (a scheduled start, or a deadline within the hour) always
//     fires: "now's the time" and "this is due soon" can't be traded for one
//     fewer interruption.
//
// A numeric per-task cap was rejected: it drops whichever alert comes LAST,
// which is usually the most urgent one.

/** Deadline alerts further out than this are heads-ups; this close, moments. */
export const HEADS_UP_DEADLINE_MINUTES = 60;

/** Whether an alert is a heads-up (droppable once the task is on the radar). */
export function isHeadsUp(alert: { kind: AlertKind; intervalMinutes?: number }): boolean {
  if (alert.kind === "target") return true;
  if (alert.kind === "deadline") {
    return (alert.intervalMinutes ?? 0) > HEADS_UP_DEADLINE_MINUTES;
  }
  return false;
}

// deadline-/target-/scheduled- keys carry the task id right after the kind.
const TASK_KEY_RE =
  /^(?:deadline|target|scheduled)-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-/i;

/** The task a dedup key is about, or null for a key that isn't task-shaped. */
export function taskIdFromDedupKey(key: string): string | null {
  return key.match(TASK_KEY_RE)?.[1] ?? null;
}

/**
 * Drop heads-ups for tasks already pushed about today, or about to be by a
 * moment alert in this same batch. `pushedTodayKeys` is every dedup key sent
 * today, cluster members and wake-up-summary folds included, since a task
 * named in any push counts as on the radar.
 */
export function dropCoveredHeadsUps<
  T extends { kind: AlertKind; intervalMinutes?: number; taskId?: string | null },
>(alerts: T[], pushedTodayKeys: Iterable<string>): { kept: T[]; dropped: T[] } {
  const covered = new Set<string>();
  for (const key of pushedTodayKeys) {
    const taskId = taskIdFromDedupKey(key);
    if (taskId) covered.add(taskId);
  }
  for (const a of alerts) {
    if (a.taskId && !isHeadsUp(a)) covered.add(a.taskId);
  }

  const kept: T[] = [];
  const dropped: T[] = [];
  for (const a of alerts) {
    if (isHeadsUp(a) && a.taskId && covered.has(a.taskId)) dropped.push(a);
    else kept.push(a);
  }
  return { kept, dropped };
}

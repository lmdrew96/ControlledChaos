/**
 * Shared rules for the /momentum page: periods, the insight-sample gate, and
 * the sentences each section is allowed to say.
 *
 * Kept free of db imports so both the stats query and the page's components
 * can use it, and so the rules are unit-testable.
 */

export type MomentumPeriod = "week" | "4w" | "all";

export const MOMENTUM_PERIODS: MomentumPeriod[] = ["week", "4w", "all"];

export const PERIOD_LABELS: Record<MomentumPeriod, { tab: string; phrase: string }> = {
  week: { tab: "This week", phrase: "this week" },
  "4w": { tab: "Last 4 weeks", phrase: "in the last 4 weeks" },
  all: { tab: "All time", phrase: "all time" },
};

export function parsePeriod(value: string | null | undefined): MomentumPeriod {
  return MOMENTUM_PERIODS.includes(value as MomentumPeriod) ? (value as MomentumPeriod) : "week";
}

/**
 * No pattern sentence below this many relevant items in the period. A
 * "pattern" in five data points is noise, and saying it out loud teaches the
 * user to distrust every other sentence on the page.
 */
export const MIN_INSIGHT_SAMPLE = 10;

export const NOT_ENOUGH_DATA = "Not enough data yet.";

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// ============================================================
// When do I work? (heatmap)
// ============================================================

export interface HeatmapCell {
  dayOfWeek: number; // 0 = Mon ... 6 = Sun
  hour: number; // 0..23, user's timezone
  count: number;
}

export const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** Time-of-day stretches, [startHour, endHour). Named the way people talk. */
export const TIME_OF_DAY = [
  { name: "late nights", range: "12a–6a", start: 0, end: 6 },
  { name: "early mornings", range: "6a–9a", start: 6, end: 9 },
  { name: "mornings", range: "9a–12p", start: 9, end: 12 },
  { name: "afternoons", range: "12p–5p", start: 12, end: 17 },
  { name: "evenings", range: "5p–9p", start: 17, end: 21 },
  { name: "late evenings", range: "9p–12a", start: 21, end: 24 },
] as const;

/** Index of the single largest value, or null when it's zero or tied. */
function strictMax(values: number[]): number | null {
  let best = -1;
  let tied = false;
  values.forEach((v, i) => {
    if (best === -1 || v > values[best]) {
      best = i;
      tied = false;
    } else if (v === values[best]) {
      tied = true;
    }
  });
  return best === -1 || tied || values[best] === 0 ? null : best;
}

/**
 * The busiest day and the busiest stretch of the day, each with its count, so
 * the sentence can be checked against the grid's rows and columns. A tie means
 * there's no busiest, and that half is left out.
 */
export function heatmapInsight(cells: HeatmapCell[]): string {
  const total = cells.reduce((s, c) => s + c.count, 0);
  if (total < MIN_INSIGHT_SAMPLE) return NOT_ENOUGH_DATA;

  const byDay = Array<number>(7).fill(0);
  const byTime = Array<number>(TIME_OF_DAY.length).fill(0);
  for (const c of cells) {
    if (c.dayOfWeek >= 0 && c.dayOfWeek < 7) byDay[c.dayOfWeek] += c.count;
    const t = TIME_OF_DAY.findIndex((r) => c.hour >= r.start && c.hour < r.end);
    if (t >= 0) byTime[t] += c.count;
  }

  const parts: string[] = [];
  const day = strictMax(byDay);
  if (day !== null) parts.push(`Busiest day: **${DAY_NAMES[day]}** (${byDay[day]} of ${total}).`);
  const time = strictMax(byTime);
  if (time !== null) {
    const r = TIME_OF_DAY[time];
    parts.push(`Busiest stretch: **${r.name}**, ${r.range} (${byTime[time]} of ${total}).`);
  }
  return parts.length > 0 ? parts.join(" ") : "No single busiest day or time. It's spread out.";
}

// ============================================================
// Does chunking help?
// ============================================================

export interface FinishRate {
  finished: number;
  total: number;
}

export const rate = (r: FinishRate): number => (r.total > 0 ? r.finished / r.total : 0);

/** Percentage points the chunked rate must beat (or trail) unchunked by. */
export const CHUNKING_MARGIN_PTS = 10;

export function chunkingInsight(chunked: FinishRate, unchunked: FinishRate): string {
  if (chunked.total < MIN_INSIGHT_SAMPLE || unchunked.total < MIN_INSIGHT_SAMPLE) {
    return NOT_ENOUGH_DATA;
  }
  const diffPts = (rate(chunked) - rate(unchunked)) * 100;
  if (diffPts >= CHUNKING_MARGIN_PTS) return "Chunked tasks get finished more often. Breaking things down seems to help.";
  if (diffPts <= -CHUNKING_MARGIN_PTS) {
    return "Chunked tasks get finished less often so far. They may just be the bigger ones.";
  }
  return "About the same either way.";
}

// ============================================================
// Am I beating deadlines?
// ============================================================

/** Finished at least this far ahead of the deadline counts as early. */
export const EARLY_THRESHOLD_SECONDS = 24 * 60 * 60;

export type DeadlineBucket = "early" | "justInTime" | "late";

export const DEADLINE_BUCKETS: DeadlineBucket[] = ["early", "justInTime", "late"];

/** secondsAhead = deadline − completion; negative means after the deadline. */
export function deadlineBucket(secondsAhead: number): DeadlineBucket {
  if (secondsAhead < 0) return "late";
  return secondsAhead >= EARLY_THRESHOLD_SECONDS ? "early" : "justInTime";
}

export function deadlineInsight(counts: Record<DeadlineBucket, number>): string {
  const total = counts.early + counts.justInTime + counts.late;
  if (total < MIN_INSIGHT_SAMPLE) return NOT_ENOUGH_DATA;
  if (counts.early / total >= 0.5) return "You usually finish with a day or more to spare.";
  if (counts.late / total >= 0.25) {
    return `About ${Math.round((counts.late / total) * 10)} in 10 land after the deadline.`;
  }
  return "Most land in the last day before the deadline.";
}

// ============================================================
// Do my plans hold?
// ============================================================

export type PlanOutcome = "inSitting" | "sameDay" | "later" | "open" | "skipped";

export const PLAN_OUTCOMES: PlanOutcome[] = ["inSitting", "sameDay", "later", "open", "skipped"];

export interface SittingFacts {
  /** The sitting's check-in: done | partial | skipped, or null if unanswered. */
  status: string | null;
  /** Local date key of the sitting's start. */
  startDay: string;
  /** Local date key the task was completed, or null if it isn't. */
  completedDay: string | null;
  /** The task was finished before this sitting began. */
  completedBeforeStart: boolean;
}

/**
 * What became of one planned sitting. A slipped sitting whose task still got
 * done the same day is its own outcome, never a failure. Returns null when
 * the task was already finished before the sitting started: that plan was
 * moot, not kept or broken.
 */
export function planOutcome(s: SittingFacts): PlanOutcome | null {
  if (s.status === "done") return "inSitting";
  if (s.completedDay !== null) {
    if (s.completedBeforeStart) return null;
    return s.completedDay === s.startDay ? "sameDay" : "later";
  }
  return s.status === "skipped" ? "skipped" : "open";
}

export function planInsight(counts: Record<PlanOutcome, number>): string {
  const total = PLAN_OUTCOMES.reduce((sum, k) => sum + counts[k], 0);
  if (total < MIN_INSIGHT_SAMPLE) return NOT_ENOUGH_DATA;
  if (counts.inSitting / total >= 0.5) return "Most of your sittings happen as planned.";
  const slipped = total - counts.inSitting;
  if (counts.sameDay >= slipped / 2) {
    return "When a sitting slips, the work usually still gets done the same day.";
  }
  if (counts.sameDay + counts.later >= slipped / 2) {
    return "When a sitting slips, the work usually still gets done, just on another day.";
  }
  return "Many sittings end up skipped or still open. Useful to know when you plan.";
}

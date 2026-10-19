import { db } from "../index";
import { sql } from "drizzle-orm";
import type { CalendarColors } from "@/types";
import { DEFAULT_CALENDAR_COLORS, categoryLabel } from "@/lib/calendar/colors";
import {
  addDaysToDateKey,
  startOfDateKey,
  todayInTimezone,
  weekStartKey,
} from "@/lib/timezone";
import {
  DEADLINE_BUCKETS,
  PLAN_OUTCOMES,
  deadlineBucket,
  median,
  planOutcome,
  type DeadlineBucket,
  type FinishRate,
  type HeatmapCell,
  type MomentumPeriod,
  type PlanOutcome,
} from "@/lib/momentum";
import { getUserSettings } from "./users";

// ============================================================
// Momentum Stats
// ============================================================

/** A task as a momentum list shows it. */
export interface MomentumTaskRef {
  id: string;
  title: string;
}

/** One planned sitting, for the plans lists. */
export interface MomentumSittingRef {
  id: string;
  taskId: string;
  title: string;
  /** Local date key the sitting started. */
  day: string;
}

export interface MomentumBar {
  /** Date key of the day, or of the week's Monday for weekly bars. */
  key: string;
  label: string;
  count: number;
  /** Set on daily bars: the day /recap opens for. */
  recapDate: string | null;
  isCurrent: boolean;
  isFuture: boolean;
}

export interface MomentumStats {
  period: MomentumPeriod;
  /** Date key the period starts on; null for all time. */
  periodStartDate: string | null;

  // --- Dashboard strip: always this week, whatever the period ---
  /** These counts (and daily, bars, heatmap, effort, records) are finished tasks plus worked sittings. */
  completedToday: number;
  completedThisWeek: number;
  /** The last 28 local days, oldest first; today is last. */
  daily: Array<{ date: string; count: number }>;
  weekStartDate: string; // "YYYY-MM-DD" of Monday in the user's timezone

  // --- 1. How's it going? ---
  periodCount: number;
  /** Median of full weeks before this one, from the first active week. Null under 3 weeks. */
  typicalWeek: number | null;
  /** First week with anything done, for "since …" on all time. */
  firstActiveWeek: string | null;
  bars: MomentumBar[];
  wins: Array<{ icon: string; title: string; subtitle: string }>;

  // --- 2. Am I beating deadlines? (hard deadlines, tasks finished in the period) ---
  deadlines: Record<DeadlineBucket, MomentumTaskRef[]>;

  // --- 3. Do my plans hold? (sittings that started in the period, up to now) ---
  plans: Record<PlanOutcome, MomentumSittingRef[]>;

  // --- 4. When do I work? ---
  hourlyHeatmap: HeatmapCell[];

  // --- 5. Does chunking help? (tasks created in the period) ---
  chunking: {
    chunked: FinishRate;
    unchunked: FinishRate;
    chunksCompleted: number;
    chunksTotal: number;
  };

  // --- 6. What's aging? ---
  marination: {
    /** Open right now; not period-scoped, because age is about today. */
    active: MarinationBuckets;
    /** Age at completion, for tasks finished in the period. */
    historical: MarinationBuckets;
    activeTasks: Record<keyof MarinationBuckets, MomentumTaskRef[]>;
  };

  // --- 7. What kind of effort? ---
  byEnergy: { low: number; medium: number; high: number };
  /** category null = unlabeled. Sums to periodCount. */
  byCategory: Array<{ category: string | null; count: number }>;

  // --- Footer: all-time records ---
  records: {
    completedAllTime: number;
    biggestDay: { count: number; date: string } | null;
    avgPerActiveDay: number;
  };

  calendarColors: CalendarColors;
}

export type MarinationBuckets = {
  fresh: number; // <1 day
  week: number; // 1–7 days
  marinating: number; // 7–30 days
  aging: number; // 30+ days
};

const MARINATION_KEYS: Array<keyof MarinationBuckets> = ["fresh", "week", "marinating", "aging"];

/** Weekly bars shown for all time. */
const ALL_TIME_WEEK_BARS = 26;
/** Prior weeks needed before "your typical week" means anything. */
const MIN_WEEKS_FOR_TYPICAL = 3;

/**
 * A category as it reads inside a sentence, not as a database value.
 *
 * `categoryLabel` gives a standalone chip label ("Errands"). This gives the
 * form that survives being embedded in prose: "All your errands, done early".
 */
function categoryPhrase(category: string): string {
  const phrases: Record<string, string> = {
    school: "schoolwork",
    work: "work tasks",
    personal: "personal tasks",
    errands: "errands",
    health: "health tasks",
  };
  return phrases[category] ?? `${category} tasks`;
}

/** "A", "A and B", "A, B and C" — an English list, not a join(", "). */
function joinNaturally(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * The last `days` local date keys ending on todayKey, oldest first. Pure
 * calendar arithmetic on the key itself — deriving keys from a local-midnight
 * instant via toISOString() lands on the previous UTC date in UTC+ zones.
 */
export function trailingDateKeys(todayKey: string, days: number): string[] {
  const [y, m, d] = todayKey.split("-").map(Number);
  return Array.from({ length: days }, (_, i) =>
    new Date(Date.UTC(y, m - 1, d - (days - 1 - i))).toISOString().slice(0, 10)
  );
}

/** Driver returns DATE columns as a string or a Date depending on path. */
const toKey = (v: string | Date): string =>
  v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);

/** Date keys name calendar days, so format them in UTC to keep the day. */
const keyFormat = (key: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-US", { ...opts, timeZone: "UTC" }).format(new Date(`${key}T12:00:00Z`));

const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export async function getMomentumStats(
  userId: string,
  timezone: string,
  period: MomentumPeriod = "week"
): Promise<MomentumStats> {
  const todayStr = todayInTimezone(timezone);
  const weekStartStr = weekStartKey(todayStr, 1);
  const last28 = trailingDateKeys(todayStr, 28);

  const periodStartDate =
    period === "week" ? weekStartStr : period === "4w" ? last28[0] : null;
  const periodStart = periodStartDate ? startOfDateKey(periodStartDate, timezone) : null;
  const dailyStart = startOfDateKey(last28[0], timezone);

  // Everything that counts as getting something done: a finished task at its
  // completion, and a sitting checked in as done or partly at its start (the
  // Mirror's rule). Checking in a sitting never completes its task, so the
  // two never describe the same act. Each carries its task's labels, so the
  // effort mix adds up to the same number as the headline.
  const doneMoments = sql`(
    SELECT completed_at AS done_at, energy_level, category
    FROM tasks
    WHERE user_id = ${userId}
      AND status = 'completed'
      AND completed_at IS NOT NULL
      AND deleted_at IS NULL
    UNION ALL
    SELECT s.starts_at AS done_at, t.energy_level, t.category
    FROM task_sessions s
    JOIN tasks t ON t.id = s.task_id
    WHERE s.user_id = ${userId}
      AND s.status IN ('done', 'partial')
      AND t.deleted_at IS NULL
  ) AS done`;
  const inPeriod = periodStart ? sql`WHERE done_at >= ${periodStart}` : sql.empty();
  const localDoneAt = sql`(done_at AT TIME ZONE 'UTC' AT TIME ZONE ${timezone})`;

  const [
    dailyRows,
    weeklyRows,
    hourlyHeatmapRows,
    effortRows,
    marinationActiveRows,
    marinationHistoricalRows,
    chunkRows,
    biggestDayRows,
    avgRows,
    allTimeRows,
    settingsResult,
    deadlineRows,
    sittingRows,
  ] = await Promise.all([
    // Daily counts, last 28 days
    db.execute<{ date: string | Date; count: number }>(
      sql`SELECT DATE(${localDoneAt}) AS date, COUNT(*)::int AS count
      FROM ${doneMoments}
      WHERE done_at >= ${dailyStart}
      GROUP BY date`
    ),
    // Weekly counts, all time (ISO weeks start Monday, like weekStartKey)
    db.execute<{ week: string | Date; count: number }>(
      sql`SELECT DATE(date_trunc('week', ${localDoneAt})) AS week, COUNT(*)::int AS count
      FROM ${doneMoments}
      GROUP BY week`
    ),
    // Hour × weekday, in the user's timezone, for the period
    db.execute<{ day_of_week: number; hour: number; count: number }>(
      sql`SELECT
        (EXTRACT(ISODOW FROM ${localDoneAt})::int - 1) AS day_of_week,
        EXTRACT(HOUR FROM ${localDoneAt})::int AS hour,
        COUNT(*)::int AS count
      FROM ${doneMoments}
      ${inPeriod}
      GROUP BY day_of_week, hour`
    ),
    // Effort mix for the period
    db.execute<{ energy_level: string; category: string | null; count: number }>(
      sql`SELECT energy_level, category, COUNT(*)::int AS count
      FROM ${doneMoments}
      ${inPeriod}
      GROUP BY energy_level, category`
    ),
    // Open tasks with their current age bucket
    db.execute<{ id: string; title: string; bucket: string }>(
      sql`SELECT id, title,
        CASE
          WHEN NOW() - created_at < INTERVAL '1 day' THEN 'fresh'
          WHEN NOW() - created_at < INTERVAL '7 days' THEN 'week'
          WHEN NOW() - created_at < INTERVAL '30 days' THEN 'marinating'
          ELSE 'aging'
        END AS bucket
      FROM tasks
      WHERE user_id = ${userId}
        AND status IN ('pending', 'in_progress')
        AND completed_at IS NULL
        AND deleted_at IS NULL
      ORDER BY created_at ASC`
    ),
    // Age at completion, for tasks finished in the period
    db.execute<{ bucket: string; count: number }>(
      sql`SELECT
        CASE
          WHEN completed_at - created_at < INTERVAL '1 day' THEN 'fresh'
          WHEN completed_at - created_at < INTERVAL '7 days' THEN 'week'
          WHEN completed_at - created_at < INTERVAL '30 days' THEN 'marinating'
          ELSE 'aging'
        END AS bucket,
        COUNT(*)::int AS count
      FROM tasks
      WHERE user_id = ${userId}
        AND status = 'completed'
        AND completed_at IS NOT NULL
        AND deleted_at IS NULL
        ${periodStart ? sql`AND completed_at >= ${periodStart}` : sql.empty()}
      GROUP BY bucket`
    ),
    // Chunked vs unchunked finish rates, for tasks created in the period.
    // Chunks live inline in tasks.progress_steps; current_step_index counts
    // the finished ones.
    db.execute<{
      chunked_total: number;
      chunked_finished: number;
      unchunked_total: number;
      unchunked_finished: number;
      chunks_total: number;
      chunks_completed: number;
    }>(
      sql`WITH t AS (
        SELECT status, current_step_index,
          COALESCE(jsonb_array_length(progress_steps), 0) AS steps
        FROM tasks
        WHERE user_id = ${userId}
          AND deleted_at IS NULL
          ${periodStart ? sql`AND created_at >= ${periodStart}` : sql.empty()}
      )
      SELECT
        COUNT(*) FILTER (WHERE steps > 0)::int AS chunked_total,
        COUNT(*) FILTER (WHERE steps > 0 AND status = 'completed')::int AS chunked_finished,
        COUNT(*) FILTER (WHERE steps = 0)::int AS unchunked_total,
        COUNT(*) FILTER (WHERE steps = 0 AND status = 'completed')::int AS unchunked_finished,
        COALESCE(SUM(steps), 0)::int AS chunks_total,
        COALESCE(SUM(
          CASE WHEN status = 'completed' THEN steps ELSE LEAST(current_step_index, steps) END
        ), 0)::int AS chunks_completed
      FROM t`
    ),
    // Records (all time, labeled as such)
    db.execute<{ date: string | Date; count: number }>(
      sql`SELECT DATE(${localDoneAt}) AS date, COUNT(*)::int AS count
      FROM ${doneMoments}
      GROUP BY date
      ORDER BY count DESC
      LIMIT 1`
    ),
    db.execute<{ avg: number }>(
      sql`SELECT COALESCE(AVG(daily_count), 0)::float AS avg
      FROM (
        SELECT COUNT(*)::int AS daily_count
        FROM ${doneMoments}
        GROUP BY DATE(${localDoneAt})
      ) AS daily_counts`
    ),
    db.execute<{ count: number }>(sql`SELECT COUNT(*)::int AS count FROM ${doneMoments}`),
    getUserSettings(userId),
    // Hard-deadline tasks finished in the period, with how far ahead they
    // landed (seconds; negative = late). Computed in SQL so it doesn't depend
    // on how the driver reads timestamp-without-tz columns.
    db.execute<{ id: string; title: string; category: string | null; seconds_ahead: number }>(
      sql`SELECT id, title, category,
        EXTRACT(EPOCH FROM (deadline - completed_at))::float AS seconds_ahead
      FROM tasks
      WHERE user_id = ${userId}
        AND status = 'completed'
        AND completed_at IS NOT NULL
        AND deadline IS NOT NULL
        AND deleted_at IS NULL
        ${periodStart ? sql`AND completed_at >= ${periodStart}` : sql.empty()}
      ORDER BY completed_at DESC`
    ),
    // Planned sittings that have started, with local days for the sitting and
    // the task's completion. Cancelled tasks are left out: letting a task go
    // isn't a plan kept or broken.
    db.execute<{
      id: string;
      task_id: string;
      title: string;
      status: string | null;
      start_day: string | Date;
      completed_day: string | Date | null;
      completed_before_start: boolean;
    }>(
      sql`SELECT s.id, s.task_id, t.title, s.status,
        DATE(s.starts_at AT TIME ZONE 'UTC' AT TIME ZONE ${timezone}) AS start_day,
        CASE WHEN t.status = 'completed' AND t.completed_at IS NOT NULL
          THEN DATE(t.completed_at AT TIME ZONE 'UTC' AT TIME ZONE ${timezone})
        END AS completed_day,
        COALESCE(t.status = 'completed' AND t.completed_at < s.starts_at, false) AS completed_before_start
      FROM task_sessions s
      JOIN tasks t ON t.id = s.task_id
      WHERE s.user_id = ${userId}
        AND t.deleted_at IS NULL
        AND t.status <> 'cancelled'
        AND s.starts_at <= NOW()
        ${periodStart ? sql`AND s.starts_at >= ${periodStart}` : sql.empty()}
      ORDER BY s.starts_at DESC`
    ),
  ]);

  // --- Daily (28 days, gap-filled) ---
  const dailyMap = new Map<string, number>();
  for (const row of dailyRows.rows) dailyMap.set(toKey(row.date), Number(row.count));
  const daily = last28.map((date) => ({ date, count: dailyMap.get(date) ?? 0 }));

  const completedToday = dailyMap.get(todayStr) ?? 0;
  const completedThisWeek = daily
    .filter((d) => d.date >= weekStartStr)
    .reduce((sum, d) => sum + d.count, 0);
  const completedAllTime = Number(allTimeRows.rows[0]?.count ?? 0);

  // --- Weekly (gap-filled from the first active week to this one) ---
  const weeklyMap = new Map<string, number>();
  for (const row of weeklyRows.rows) weeklyMap.set(toKey(row.week), Number(row.count));
  const firstActiveWeek = [...weeklyMap.keys()].sort()[0] ?? null;
  const weeks: Array<{ week: string; count: number }> = [];
  if (firstActiveWeek) {
    for (let w = firstActiveWeek; w <= weekStartStr; w = addDaysToDateKey(w, 7)) {
      weeks.push({ week: w, count: weeklyMap.get(w) ?? 0 });
    }
  }
  const priorWeeks = weeks.filter((w) => w.week < weekStartStr).map((w) => w.count);
  const typicalWeek = priorWeeks.length >= MIN_WEEKS_FOR_TYPICAL ? median(priorWeeks) : null;

  // --- Bars for the period ---
  let bars: MomentumBar[];
  if (period === "all") {
    let lastMonth = "";
    bars = weeks.slice(-ALL_TIME_WEEK_BARS).map((w) => {
      const month = keyFormat(w.week, { month: "short" });
      const label = month !== lastMonth ? month : "";
      lastMonth = month;
      return {
        key: w.week,
        label,
        count: w.count,
        recapDate: null,
        isCurrent: w.week === weekStartStr,
        isFuture: false,
      };
    });
  } else {
    const keys =
      period === "week"
        ? Array.from({ length: 7 }, (_, i) => addDaysToDateKey(weekStartStr, i))
        : last28;
    bars = keys.map((key, i) => {
      const isFuture = key > todayStr;
      const label =
        key === todayStr
          ? "Today"
          : period === "week"
            ? WEEKDAY_SHORT[i]
            : // 4 weeks: label the Mondays so the weeks are readable
              weekStartKey(key, 1) === key
              ? keyFormat(key, { month: "short", day: "numeric" })
              : "";
      return {
        key,
        label,
        count: dailyMap.get(key) ?? 0,
        recapDate: isFuture ? null : key,
        isCurrent: key === todayStr,
        isFuture,
      };
    });
  }

  const periodCount =
    period === "week"
      ? completedThisWeek
      : period === "4w"
        ? daily.reduce((sum, d) => sum + d.count, 0)
        : completedAllTime;

  // --- Records ---
  const biggestDayRow = biggestDayRows.rows[0];
  const biggestDay = biggestDayRow
    ? { count: Number(biggestDayRow.count), date: toKey(biggestDayRow.date) }
    : null;
  const avgPerActiveDay = Number(avgRows.rows[0]?.avg ?? 0);

  // --- Heatmap ---
  const hourlyHeatmap = hourlyHeatmapRows.rows.map((r) => ({
    dayOfWeek: Number(r.day_of_week),
    hour: Number(r.hour),
    count: Number(r.count),
  }));

  // --- Effort ---
  const byEnergy = { low: 0, medium: 0, high: 0 };
  const categoryMap = new Map<string | null, number>();
  for (const r of effortRows.rows) {
    const count = Number(r.count);
    if (r.energy_level in byEnergy) byEnergy[r.energy_level as keyof typeof byEnergy] += count;
    categoryMap.set(r.category, (categoryMap.get(r.category) ?? 0) + count);
  }
  const byCategory = [...categoryMap.entries()]
    .map(([category, count]) => ({ category, count }))
    // Unlabeled last, whatever its size: it's the leftover, not a category.
    .sort((a, b) => (a.category === null ? 1 : b.category === null ? -1 : b.count - a.count));

  // --- Marination ---
  const emptyBuckets = (): MarinationBuckets => ({ fresh: 0, week: 0, marinating: 0, aging: 0 });
  const isBucket = (b: string): b is keyof MarinationBuckets =>
    (MARINATION_KEYS as string[]).includes(b);
  const active = emptyBuckets();
  const activeTasks: Record<keyof MarinationBuckets, MomentumTaskRef[]> = {
    fresh: [],
    week: [],
    marinating: [],
    aging: [],
  };
  for (const r of marinationActiveRows.rows) {
    if (!isBucket(r.bucket)) continue;
    active[r.bucket]++;
    activeTasks[r.bucket].push({ id: r.id, title: r.title });
  }
  const historical = emptyBuckets();
  for (const r of marinationHistoricalRows.rows) {
    if (isBucket(r.bucket)) historical[r.bucket] = Number(r.count);
  }

  // --- Chunking ---
  const c = chunkRows.rows[0];
  const chunking = {
    chunked: { finished: Number(c?.chunked_finished ?? 0), total: Number(c?.chunked_total ?? 0) },
    unchunked: { finished: Number(c?.unchunked_finished ?? 0), total: Number(c?.unchunked_total ?? 0) },
    chunksCompleted: Number(c?.chunks_completed ?? 0),
    chunksTotal: Number(c?.chunks_total ?? 0),
  };

  // --- Deadlines ---
  const deadlines = Object.fromEntries(
    DEADLINE_BUCKETS.map((b) => [b, [] as MomentumTaskRef[]])
  ) as Record<DeadlineBucket, MomentumTaskRef[]>;
  for (const r of deadlineRows.rows) {
    deadlines[deadlineBucket(Number(r.seconds_ahead))].push({ id: r.id, title: r.title });
  }

  // --- Plans ---
  const plans = Object.fromEntries(
    PLAN_OUTCOMES.map((o) => [o, [] as MomentumSittingRef[]])
  ) as Record<PlanOutcome, MomentumSittingRef[]>;
  for (const r of sittingRows.rows) {
    const day = toKey(r.start_day);
    const outcome = planOutcome({
      status: r.status,
      startDay: day,
      completedDay: r.completed_day === null ? null : toKey(r.completed_day),
      completedBeforeStart: Boolean(r.completed_before_start),
    });
    if (outcome) plans[outcome].push({ id: r.id, taskId: r.task_id, title: r.title, day });
  }

  const calendarColors: CalendarColors =
    (settingsResult?.calendarColors as CalendarColors | null) ?? DEFAULT_CALENDAR_COLORS;

  // === Wins, for the period ===
  //
  // These strings are read by a person looking at their week, so they have to
  // sound like a sentence someone would say. Category KEYS ("errands",
  // "school") are database values, not English — dropping one into
  // "All ${category} tasks done early" produced "All errands tasks done early".
  const wins: Array<{ icon: string; title: string; subtitle: string }> = [];

  // 1. New personal best (meaningless for all time: it always holds)
  if (biggestDay && period !== "all") {
    const newPB = bars.some((b) => b.count >= biggestDay.count && b.count > 0);
    if (newPB) {
      wins.push({
        icon: "⚡",
        title: "New personal best",
        // Tasks and sittings both count, so the noun stays out of it.
        subtitle: `${biggestDay.count} done in a single day`,
      });
    }
  }

  // 2. High-energy work
  if (byEnergy.high >= 3 && wins.length < 3) {
    wins.push({
      icon: "💪",
      title: `${byEnergy.high} high-energy things done`,
      subtitle: "Tackling the tough stuff",
    });
  }

  // 3. All deadline tasks met for a category
  const deadlineByCategory = new Map<string, { met: number; total: number }>();
  for (const r of deadlineRows.rows) {
    if (!r.category) continue;
    const entry = deadlineByCategory.get(r.category) ?? { met: 0, total: 0 };
    entry.total++;
    if (Number(r.seconds_ahead) >= 0) entry.met++;
    deadlineByCategory.set(r.category, entry);
  }
  for (const [category, { met, total }] of deadlineByCategory) {
    if (wins.length >= 3) break;
    // Two or more, so the phrasing can stay plural. "All your errands, done
    // early" about a single errand is a strange thing to say to someone.
    if (met === total && total > 1) {
      wins.push({
        icon: "🎯",
        title: `All your ${categoryPhrase(category)}, done early`,
        subtitle: `All ${total} beat their deadlines`,
      });
    }
  }

  // 4. Double digits (a week's milestone, so only on the week view)
  if (period === "week" && completedThisWeek >= 10 && wins.length < 3) {
    wins.push({
      icon: "🔥",
      title: "Double digits this week",
      subtitle: `${completedThisWeek} done so far`,
    });
  }

  // 5. A spread of areas
  if (wins.length < 3) {
    const named = byCategory
      .filter((c) => c.category !== null && c.count > 0)
      .map((c) => categoryLabel(String(c.category)))
      .filter((label): label is string => Boolean(label));
    if (named.length >= 3) {
      // Naming the actual areas beats counting them. Nobody thinks of their
      // week as "3 categories".
      wins.push({
        icon: "🌈",
        title: "A bit of everything",
        subtitle: `${joinNaturally(named)} all moved`,
      });
    }
  }

  return {
    period,
    periodStartDate,
    completedToday,
    completedThisWeek,
    daily,
    weekStartDate: weekStartStr,
    periodCount,
    typicalWeek,
    firstActiveWeek,
    bars,
    wins,
    deadlines,
    plans,
    hourlyHeatmap,
    chunking,
    marination: { active, historical, activeTasks },
    byEnergy,
    byCategory,
    records: { completedAllTime, biggestDay, avgPerActiveDay },
    calendarColors,
  };
}

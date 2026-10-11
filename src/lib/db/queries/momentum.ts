import { db } from "../index";
import { sql } from "drizzle-orm";
import type { CalendarColors } from "@/types";
import { DEFAULT_CALENDAR_COLORS, categoryLabel } from "@/lib/calendar/colors";
import {
  startOfDayInTimezone,
  todayInTimezone,
  startOfWeekInTimezone,
  toDateKeyInTimezone,
} from "@/lib/timezone";
import { getUserSettings } from "./users";

// ============================================================
// Momentum Stats
// ============================================================

export interface MomentumStats {
  /** These counts (and daily, biggestDay, avg, heatmap) are finished tasks plus worked sittings. */
  completedToday: number;
  completedThisWeek: number;
  completedAllTime: number;
  biggestDay: { count: number; date: string } | null;
  avgPerActiveDay: number;
  daily: Array<{ date: string; count: number }>;
  hourlyHeatmap: Array<{
    dayOfWeek: number; // 0 = Mon ... 6 = Sun
    hour: number; // 0..23 in user's timezone
    count: number;
  }>;
  marination: {
    active: MarinationBuckets;
    historical: MarinationBuckets;
  };
  chunkOutcomes: {
    parentsChunked: number; // parent tasks that have at least one chunk
    parentsCompleted: number; // of those, how many are completed
    chunksTotal: number; // total chunks (children)
    chunksCompleted: number; // of those, how many are completed
  };
  byCategory: Array<{ category: string | null; count: number }>;
  byEnergy: { low: number; medium: number; high: number };
  wins: Array<{ icon: string; title: string; subtitle: string }>;
  calendarColors: CalendarColors;
  weekStartDate: string; // ISO "YYYY-MM-DD" of Monday in user's timezone
}

export type MarinationBuckets = {
  fresh: number; // <1 day
  week: number; // 1–7 days
  marinating: number; // 7–30 days
  aging: number; // 30+ days
};

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

export async function getMomentumStats(
  userId: string,
  timezone: string
): Promise<MomentumStats> {
  const now = new Date();
  const startOfDay = startOfDayInTimezone(now, timezone);
  const todayStr = todayInTimezone(timezone);

  const startOfWeek = startOfWeekInTimezone(timezone);

  const fourteenDaysAgo = new Date(startOfDay);
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13);

  // Everything that counts as getting something done: a finished task at its
  // completion, and a sitting checked in as done or partly at its start (the
  // Mirror's rule). Checking in a sitting never completes its task, so the
  // two never describe the same act.
  const doneMoments = sql`(
    SELECT completed_at AS done_at
    FROM tasks
    WHERE user_id = ${userId}
      AND status = 'completed'
      AND completed_at IS NOT NULL
      AND deleted_at IS NULL
    UNION ALL
    SELECT s.starts_at AS done_at
    FROM task_sessions s
    JOIN tasks t ON t.id = s.task_id
    WHERE s.user_id = ${userId}
      AND s.status IN ('done', 'partial')
      AND t.deleted_at IS NULL
  ) AS done`;

  // All queries in parallel
  const [
    dailyRows,
    hourlyHeatmapRows,
    marinationActiveRows,
    marinationHistoricalRows,
    chunkOutcomesRows,
    categoryRows,
    energyRows,
    biggestDayRows,
    avgRows,
    allTimeRows,
    settingsResult,
    deadlineRows,
  ] = await Promise.all([
    // 1. Daily breakdown (14 days)
    db.execute<{ date: string | Date; count: number }>(
      sql`SELECT
        DATE(done_at AT TIME ZONE 'UTC' AT TIME ZONE ${timezone}) AS date,
        COUNT(*)::int AS count
      FROM ${doneMoments}
      WHERE done_at >= ${fourteenDaysAgo}
      GROUP BY date
      ORDER BY date ASC`
    ),
    // 2. Hourly heatmap (all-time, 7 days × 24 hours)
    db.execute<{ day_of_week: number; hour: number; count: number }>(
      sql`SELECT
        (EXTRACT(ISODOW FROM done_at AT TIME ZONE 'UTC' AT TIME ZONE ${timezone})::int - 1) AS day_of_week,
        EXTRACT(HOUR FROM done_at AT TIME ZONE 'UTC' AT TIME ZONE ${timezone})::int AS hour,
        COUNT(*)::int AS count
      FROM ${doneMoments}
      GROUP BY day_of_week, hour`
    ),
    // 2a. Marination — active tasks bucketed by current age (top-level only)
    db.execute<{ bucket: string; count: number }>(
      sql`SELECT
        CASE
          WHEN NOW() - created_at < INTERVAL '1 day' THEN 'fresh'
          WHEN NOW() - created_at < INTERVAL '7 days' THEN 'week'
          WHEN NOW() - created_at < INTERVAL '30 days' THEN 'marinating'
          ELSE 'aging'
        END AS bucket,
        COUNT(*)::int AS count
      FROM tasks
      WHERE user_id = ${userId}
        AND status IN ('pending', 'in_progress')
        AND completed_at IS NULL
        AND deleted_at IS NULL
      GROUP BY bucket`
    ),
    // 2b. Marination — historical distribution: age at completion (top-level only)
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
      GROUP BY bucket`
    ),
    // 2c. Chunk outcomes — chunks are stored in tasks.progress_steps JSONB,
    // NOT as child rows. One task = one "chunked parent"; its chunks live
    // inline. current_step_index is the count of completed chunks (0-based
    // becomes a count since users increment past the last step on complete).
    db.execute<{
      parents_total: number;
      parents_completed: number;
      chunks_total: number;
      chunks_completed: number;
    }>(
      sql`SELECT
        COUNT(*)::int AS parents_total,
        COUNT(*) FILTER (WHERE status = 'completed')::int AS parents_completed,
        COALESCE(SUM(jsonb_array_length(progress_steps)), 0)::int AS chunks_total,
        COALESCE(SUM(
          CASE
            WHEN status = 'completed' THEN jsonb_array_length(progress_steps)
            ELSE LEAST(current_step_index, jsonb_array_length(progress_steps))
          END
        ), 0)::int AS chunks_completed
      FROM tasks
      WHERE user_id = ${userId}
        AND deleted_at IS NULL
        AND progress_steps IS NOT NULL
        AND jsonb_array_length(progress_steps) > 0`
    ),
    // 3. By category (current week)
    db.execute<{ category: string | null; count: number }>(
      sql`SELECT category, COUNT(*)::int AS count
      FROM tasks
      WHERE user_id = ${userId}
        AND status = 'completed'
        AND completed_at >= ${startOfWeek}
        AND deleted_at IS NULL
      GROUP BY category
      ORDER BY count DESC`
    ),
    // 4. By energy (current week)
    db.execute<{ energy_level: string; count: number }>(
      sql`SELECT energy_level, COUNT(*)::int AS count
      FROM tasks
      WHERE user_id = ${userId}
        AND status = 'completed'
        AND completed_at >= ${startOfWeek}
        AND deleted_at IS NULL
      GROUP BY energy_level`
    ),
    // 5. Biggest day (all-time)
    db.execute<{ date: string | Date; count: number }>(
      sql`SELECT
        DATE(done_at AT TIME ZONE 'UTC' AT TIME ZONE ${timezone}) AS date,
        COUNT(*)::int AS count
      FROM ${doneMoments}
      GROUP BY date
      ORDER BY count DESC
      LIMIT 1`
    ),
    // 6. Average per active day (all-time)
    db.execute<{ avg: number }>(
      sql`SELECT COALESCE(AVG(daily_count), 0)::float AS avg
      FROM (
        SELECT COUNT(*)::int AS daily_count
        FROM ${doneMoments}
        GROUP BY DATE(done_at AT TIME ZONE 'UTC' AT TIME ZONE ${timezone})
      ) AS daily_counts`
    ),
    // 7. All-time count
    db.execute<{ count: number }>(sql`SELECT COUNT(*)::int AS count FROM ${doneMoments}`),
    // 8. User settings (for calendarColors)
    getUserSettings(userId),
    // 9. Deadline tasks (current week) — for wins heuristic
    db.execute<{ category: string | null; met: number; total: number }>(
      sql`SELECT
        category,
        COUNT(*) FILTER (WHERE completed_at <= deadline)::int AS met,
        COUNT(*)::int AS total
      FROM tasks
      WHERE user_id = ${userId}
        AND status = 'completed'
        AND completed_at >= ${startOfWeek}
        AND deadline IS NOT NULL
        AND deleted_at IS NULL
      GROUP BY category`
    ),
  ]);

  // Gap-fill daily dates for 14 days
  const dailyMap = new Map<string, number>();
  for (const row of dailyRows.rows) {
    // Normalize date to YYYY-MM-DD regardless of whether driver returns string or Date
    const d = row.date instanceof Date
      ? row.date.toISOString().slice(0, 10)
      : String(row.date).slice(0, 10);
    dailyMap.set(d, Number(row.count));
  }
  const daily = trailingDateKeys(todayStr, 14).map((date) => ({
    date,
    count: dailyMap.get(date) ?? 0,
  }));

  // Derive today/week counts from daily array
  const completedToday = daily.find((d) => d.date === todayStr)?.count ?? 0;

  const startOfWeekStr = toDateKeyInTimezone(startOfWeek, timezone);
  const completedThisWeek = daily
    .filter((d) => d.date >= startOfWeekStr)
    .reduce((sum, d) => sum + d.count, 0);

  const completedAllTime = Number(allTimeRows.rows[0]?.count ?? 0);

  // Biggest day
  const biggestDayRow = biggestDayRows.rows[0];
  const biggestDay = biggestDayRow
    ? {
        count: Number(biggestDayRow.count),
        date: biggestDayRow.date instanceof Date
          ? biggestDayRow.date.toISOString().slice(0, 10)
          : String(biggestDayRow.date).slice(0, 10),
      }
    : null;

  // Avg per active day
  const avgPerActiveDay = Number(avgRows.rows[0]?.avg ?? 0);

  // Hourly heatmap (all-time)
  const hourlyHeatmap = hourlyHeatmapRows.rows.map((r) => ({
    dayOfWeek: Number(r.day_of_week),
    hour: Number(r.hour),
    count: Number(r.count),
  }));

  // Marination buckets
  const emptyBuckets: MarinationBuckets = {
    fresh: 0,
    week: 0,
    marinating: 0,
    aging: 0,
  };
  const readBuckets = (
    rows: Array<{ bucket: string; count: number }>
  ): MarinationBuckets => {
    const buckets: MarinationBuckets = { ...emptyBuckets };
    for (const r of rows) {
      const key = r.bucket as keyof MarinationBuckets;
      if (key in buckets) buckets[key] = Number(r.count);
    }
    return buckets;
  };
  const marination = {
    active: readBuckets(marinationActiveRows.rows),
    historical: readBuckets(marinationHistoricalRows.rows),
  };

  // Chunk outcomes
  const chunkRow = chunkOutcomesRows.rows[0];
  const chunkOutcomes = {
    parentsChunked: Number(chunkRow?.parents_total ?? 0),
    parentsCompleted: Number(chunkRow?.parents_completed ?? 0),
    chunksTotal: Number(chunkRow?.chunks_total ?? 0),
    chunksCompleted: Number(chunkRow?.chunks_completed ?? 0),
  };

  // By category
  const byCategory = categoryRows.rows.map((r) => ({
    category: r.category,
    count: Number(r.count),
  }));

  // By energy
  const energyMap: Record<string, number> = {};
  for (const r of energyRows.rows) {
    energyMap[r.energy_level] = Number(r.count);
  }
  const byEnergy = {
    low: energyMap["low"] ?? 0,
    medium: energyMap["medium"] ?? 0,
    high: energyMap["high"] ?? 0,
  };

  // Calendar colors
  const calendarColors: CalendarColors =
    (settingsResult?.calendarColors as CalendarColors | null) ?? DEFAULT_CALENDAR_COLORS;

  // === Wins computation ===
  //
  // These strings are read by a person looking at their week, so they have to
  // sound like a sentence someone would say. Category KEYS ("errands",
  // "school") are database values, not English — dropping one into
  // "All ${category} tasks done early" produced "All errands tasks done early".
  const wins: Array<{ icon: string; title: string; subtitle: string }> = [];

  // 1. New personal best
  if (biggestDay) {
    const thisWeekDays = daily.filter((d) => d.date >= startOfWeekStr);
    const newPB = thisWeekDays.some((d) => d.count >= biggestDay.count && d.count > 0);
    if (newPB && wins.length < 3) {
      wins.push({
        icon: "\u26A1",
        title: "New personal best",
        // Tasks and sittings both count, so the noun stays out of it.
        subtitle: `${biggestDay.count} done in a single day`,
      });
    }
  }

  // 2. High-energy tasks
  if (byEnergy.high >= 3 && wins.length < 3) {
    wins.push({
      icon: "\uD83D\uDCAA",
      title: `Knocked out ${byEnergy.high} high-energy tasks`,
      subtitle: "Tackling the tough stuff",
    });
  }

  // 3. All deadline tasks met for a category
  for (const dr of deadlineRows.rows) {
    if (wins.length >= 3) break;
    const total = Number(dr.total);
    // Two or more, so the phrasing can stay plural. "All your errands, done
    // early" about a single errand is a strange thing to say to someone.
    if (Number(dr.met) === total && total > 1 && dr.category) {
      wins.push({
        icon: "\uD83C\uDFAF",
        title: `All your ${categoryPhrase(String(dr.category))}, done early`,
        subtitle: `All ${total} beat their deadlines`,
      });
    }
  }

  // 4. Double digits
  if (completedThisWeek >= 10 && wins.length < 3) {
    wins.push({
      icon: "\uD83D\uDD25",
      title: "Double digits this week",
      subtitle: `${completedThisWeek} done so far`,
    });
  }

  // 5. Multi-category day
  if (wins.length < 3) {
    // Check daily category spread — need per-day category counts from heatmap or raw data
    // Approximate: check if byCategory has 3+ categories this week
    const activeCategories = byCategory.filter((c) => c.count > 0);
    if (activeCategories.length >= 3) {
      // Naming the actual areas beats counting them. Nobody thinks of their
      // week as "3 categories".
      const named = activeCategories
        .map((c) => categoryLabel(String(c.category)))
        .filter((label): label is string => Boolean(label));
      wins.push({
        icon: "\uD83C\uDF08",
        title: "A bit of everything this week",
        subtitle:
          named.length > 0 ? `${joinNaturally(named)} all moved` : "Nice spread of work",
      });
    }
  }

  return {
    completedToday,
    completedThisWeek,
    completedAllTime,
    biggestDay,
    avgPerActiveDay,
    daily,
    hourlyHeatmap,
    marination,
    chunkOutcomes,
    byCategory,
    byEnergy,
    wins,
    calendarColors,
    weekStartDate: startOfWeekStr,
  };
}



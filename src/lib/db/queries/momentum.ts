import { db } from "../index";
import { tasks } from "../schema";
import { eq, and, isNull, sql } from "drizzle-orm";
import type { CalendarColors } from "@/types";
import { DEFAULT_CALENDAR_COLORS } from "@/lib/calendar/colors";
import { startOfDayInTimezone, todayInTimezone, startOfWeekInTimezone } from "@/lib/timezone";
import { getUserSettings } from "./users";

// ============================================================
// Momentum Stats
// ============================================================

export interface MomentumStats {
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
        DATE(completed_at AT TIME ZONE 'UTC' AT TIME ZONE ${timezone}) AS date,
        COUNT(*)::int AS count
      FROM tasks
      WHERE user_id = ${userId}
        AND status = 'completed'
        AND completed_at >= ${fourteenDaysAgo}
        AND deleted_at IS NULL
      GROUP BY date
      ORDER BY date ASC`
    ),
    // 2. Hourly heatmap (all-time, 7 days × 24 hours)
    db.execute<{ day_of_week: number; hour: number; count: number }>(
      sql`SELECT
        (EXTRACT(ISODOW FROM completed_at AT TIME ZONE 'UTC' AT TIME ZONE ${timezone})::int - 1) AS day_of_week,
        EXTRACT(HOUR FROM completed_at AT TIME ZONE 'UTC' AT TIME ZONE ${timezone})::int AS hour,
        COUNT(*)::int AS count
      FROM tasks
      WHERE user_id = ${userId}
        AND status = 'completed'
        AND deleted_at IS NULL
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
        DATE(completed_at AT TIME ZONE 'UTC' AT TIME ZONE ${timezone}) AS date,
        COUNT(*)::int AS count
      FROM tasks
      WHERE user_id = ${userId} AND status = 'completed' AND deleted_at IS NULL
      GROUP BY date
      ORDER BY count DESC
      LIMIT 1`
    ),
    // 6. Average per active day (all-time)
    db.execute<{ avg: number }>(
      sql`SELECT COALESCE(AVG(daily_count), 0)::float AS avg
      FROM (
        SELECT COUNT(*)::int AS daily_count
        FROM tasks
        WHERE user_id = ${userId} AND status = 'completed' AND deleted_at IS NULL
        GROUP BY DATE(completed_at AT TIME ZONE 'UTC' AT TIME ZONE ${timezone})
      ) AS daily_counts`
    ),
    // 7. All-time count
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(tasks)
      .where(and(eq(tasks.userId, userId), eq(tasks.status, "completed"), isNull(tasks.deletedAt))),
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
  const daily: Array<{ date: string; count: number }> = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(startOfDay);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    daily.push({ date: dateStr, count: dailyMap.get(dateStr) ?? 0 });
  }

  // Derive today/week counts from daily array
  const completedToday = daily.find((d) => d.date === todayStr)?.count ?? 0;

  const startOfWeekStr = startOfWeek.toISOString().slice(0, 10);
  const completedThisWeek = daily
    .filter((d) => d.date >= startOfWeekStr)
    .reduce((sum, d) => sum + d.count, 0);

  const completedAllTime = allTimeRows[0]?.count ?? 0;

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
  const wins: Array<{ icon: string; title: string; subtitle: string }> = [];

  // 1. New personal best
  if (biggestDay) {
    const thisWeekDays = daily.filter((d) => d.date >= startOfWeekStr);
    const newPB = thisWeekDays.some((d) => d.count >= biggestDay.count && d.count > 0);
    if (newPB && wins.length < 3) {
      wins.push({
        icon: "\u26A1",
        title: `New personal best: ${biggestDay.count} in a day`,
        subtitle: "Your biggest day yet!",
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
    if (Number(dr.met) === Number(dr.total) && Number(dr.total) > 0 && dr.category) {
      wins.push({
        icon: "\uD83C\uDFAF",
        title: `All ${dr.category} tasks done early`,
        subtitle: "Ahead of every deadline",
      });
    }
  }

  // 4. Double digits
  if (completedThisWeek >= 10 && wins.length < 3) {
    wins.push({
      icon: "\uD83D\uDD25",
      title: "Double digits this week",
      subtitle: `${completedThisWeek} tasks completed`,
    });
  }

  // 5. Multi-category day
  if (wins.length < 3) {
    // Check daily category spread — need per-day category counts from heatmap or raw data
    // Approximate: check if byCategory has 3+ categories this week
    const categoriesWithCompletions = byCategory.filter((c) => c.count > 0).length;
    if (categoriesWithCompletions >= 3) {
      wins.push({
        icon: "\uD83C\uDF08",
        title: `Tackled ${categoriesWithCompletions} categories this week`,
        subtitle: "Nice variety",
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
    weekStartDate: startOfWeek.toISOString().slice(0, 10),
  };
}



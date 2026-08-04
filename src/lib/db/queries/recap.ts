import { db } from "../index";
import { tasks } from "../schema";
import { eq, and, gte, lt, isNull } from "drizzle-orm";
import type { RecapEntry, RecapKind } from "@/types";
import { assembleRecapEntries } from "@/lib/recap/assemble";
import { getCalendarEventsByDateRange } from "./calendar";
import { getBrainDumpsByDateRange } from "./brain-dumps";
import { listMoments } from "./moments";

// ============================================================
// Daily Recap (chronological day timeline — merges source tables)
// ============================================================

/**
 * Fetch a day's worth of activity across tasks, events, brain dumps,
 * junk journal entries, and moments. Runs all source queries in
 * parallel and merges into a single array sorted by `at` descending
 * (most recent first). Respects `typeFilters` — unspecified kinds are
 * skipped entirely (no wasted DB round-trip).
 */
export async function getRecapDay(
  userId: string,
  dayStart: Date,
  dayEnd: Date,
  typeFilters?: RecapKind[]
): Promise<RecapEntry[]> {
  const want = (k: RecapKind) => !typeFilters || typeFilters.includes(k);

  const [completedTasks, dayEvents, dayDumps, dayJournal, dayMoments] =
    await Promise.all([
      want("task")
        ? db
            .select()
            .from(tasks)
            .where(
              and(
                eq(tasks.userId, userId),
                eq(tasks.status, "completed"),
                gte(tasks.completedAt, dayStart),
                lt(tasks.completedAt, dayEnd),
                isNull(tasks.deletedAt)
              )
            )
        : Promise.resolve([]),
      want("event")
        ? getCalendarEventsByDateRange(userId, dayStart, dayEnd)
        : Promise.resolve([]),
      want("dump")
        ? getBrainDumpsByDateRange(userId, dayStart, dayEnd, "braindump")
        : Promise.resolve([]),
      want("journal")
        ? getBrainDumpsByDateRange(userId, dayStart, dayEnd, "junk_journal")
        : Promise.resolve([]),
      want("moment")
        ? listMoments(userId, { from: dayStart, to: dayEnd, limit: 200 })
        : Promise.resolve([]),
    ]);

  return assembleRecapEntries({
    tasks: completedTasks,
    events: dayEvents,
    dumps: dayDumps,
    journal: dayJournal,
    moments: dayMoments,
    typeFilters,
  });
}



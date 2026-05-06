import { db } from "../index";
import { medications, tasks } from "../schema";
import { eq, and, gte, lt, inArray, isNull } from "drizzle-orm";
import type { RecapEntry, RecapKind } from "@/types";
import { assembleRecapEntries } from "@/lib/recap/assemble";
import { getCalendarEventsByDateRange } from "./calendar";
import { getBrainDumpsByDateRange } from "./brain-dumps";
import { listMoments } from "./moments";
import { getMedicationLogsByDate } from "./medications";

// ============================================================
// Daily Recap (chronological day timeline — merges 6 source tables)
// ============================================================

/**
 * Fetch a day's worth of activity across tasks, events, brain dumps,
 * junk journal entries, moments, and medication logs. Runs all source
 * queries in parallel and merges into a single array sorted by `at`
 * descending (most recent first). Respects `typeFilters` — unspecified
 * kinds are skipped entirely (no wasted DB round-trip).
 *
 * Accepts a date-string (YYYY-MM-DD) for the medication-logs path which
 * stores date as text, and a Date window for timestamp-based queries.
 */
export async function getRecapDay(
  userId: string,
  dayStart: Date,
  dayEnd: Date,
  dateString: string, // YYYY-MM-DD for medication_logs.scheduledDate
  typeFilters?: RecapKind[]
): Promise<RecapEntry[]> {
  const want = (k: RecapKind) => !typeFilters || typeFilters.includes(k);

  const [
    completedTasks,
    dayEvents,
    dayDumps,
    dayJournal,
    dayMoments,
    medLogs,
  ] = await Promise.all([
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
    want("med")
      ? getMedicationLogsByDate(userId, dateString)
      : Promise.resolve([]),
  ]);

  // Hydrate medication names+dosages in a single batched query
  const medIds = Array.from(new Set(medLogs.map((m) => m.medicationId)));
  const medLookup = new Map<string, { name: string; dosage: string }>();
  if (medIds.length > 0) {
    const meds = await db
      .select({
        id: medications.id,
        name: medications.name,
        dosage: medications.dosage,
      })
      .from(medications)
      .where(
        and(eq(medications.userId, userId), inArray(medications.id, medIds))
      );
    for (const m of meds) {
      medLookup.set(m.id, { name: m.name, dosage: m.dosage });
    }
  }

  return assembleRecapEntries({
    tasks: completedTasks,
    events: dayEvents,
    dumps: dayDumps,
    journal: dayJournal,
    moments: dayMoments,
    medLogs,
    medLookup,
    typeFilters,
  });
}



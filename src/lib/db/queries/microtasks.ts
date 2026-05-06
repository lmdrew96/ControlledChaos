import { db } from "../index";
import { microtasks, microtaskCompletions } from "../schema";
import { eq, and, asc, desc, gte, lte, inArray } from "drizzle-orm";

// ============================================================
// Microtasks
// ============================================================

export type MicrotaskTimeOfDay = "morning" | "afternoon" | "evening" | "anytime";

export type MicrotaskRow = typeof microtasks.$inferSelect;

export interface MicrotaskWithStatus extends MicrotaskRow {
  completedToday: boolean;
  todayNote: string | null;
  completionCount7d: number;
  scheduledToday: boolean;
}

export interface CreateMicrotaskInput {
  title: string;
  emoji?: string | null;
  timeOfDay?: MicrotaskTimeOfDay;
  daysOfWeek?: number[];
  sortOrder?: number;
}

export interface UpdateMicrotaskInput {
  title?: string;
  emoji?: string | null;
  timeOfDay?: MicrotaskTimeOfDay;
  daysOfWeek?: number[];
  active?: boolean;
  sortOrder?: number;
}

export async function createMicrotask(userId: string, input: CreateMicrotaskInput) {
  const [row] = await db
    .insert(microtasks)
    .values({
      userId,
      title: input.title,
      emoji: input.emoji ?? null,
      timeOfDay: input.timeOfDay ?? "anytime",
      ...(input.daysOfWeek ? { daysOfWeek: input.daysOfWeek } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    })
    .returning();
  return row;
}

export async function updateMicrotask(
  id: string,
  userId: string,
  patch: UpdateMicrotaskInput
): Promise<MicrotaskRow | null> {
  const setFields: Partial<typeof microtasks.$inferInsert> = { updatedAt: new Date() };
  if (patch.title !== undefined) setFields.title = patch.title;
  if (patch.emoji !== undefined) setFields.emoji = patch.emoji;
  if (patch.timeOfDay !== undefined) setFields.timeOfDay = patch.timeOfDay;
  if (patch.daysOfWeek !== undefined) setFields.daysOfWeek = patch.daysOfWeek;
  if (patch.active !== undefined) setFields.active = patch.active;
  if (patch.sortOrder !== undefined) setFields.sortOrder = patch.sortOrder;

  const [row] = await db
    .update(microtasks)
    .set(setFields)
    .where(and(eq(microtasks.id, id), eq(microtasks.userId, userId)))
    .returning();
  return row ?? null;
}

/** Soft delete: sets active=false. Preserves completion history. */
export async function deactivateMicrotask(id: string, userId: string): Promise<MicrotaskRow | null> {
  return updateMicrotask(id, userId, { active: false });
}

/** Manage view: list every microtask the user owns (active first, then inactive). */
export async function listAllMicrotasksForUser(userId: string): Promise<MicrotaskRow[]> {
  return db
    .select()
    .from(microtasks)
    .where(eq(microtasks.userId, userId))
    .orderBy(desc(microtasks.active), asc(microtasks.sortOrder), asc(microtasks.createdAt));
}

/**
 * Dashboard view: list active microtasks for the user, enriched with
 * today-completion + rolling 7-day count + scheduledToday flag.
 *
 * `today` is YYYY-MM-DD in the user's timezone (compute via todayInTimezone).
 * `dayOfWeek` is 0=Sun..6=Sat in the user's timezone.
 */
export async function getMicrotasksForDashboard(
  userId: string,
  today: string,
  dayOfWeek: number
): Promise<MicrotaskWithStatus[]> {
  const rows = await db
    .select()
    .from(microtasks)
    .where(and(eq(microtasks.userId, userId), eq(microtasks.active, true)))
    .orderBy(asc(microtasks.sortOrder), asc(microtasks.createdAt));

  if (rows.length === 0) return [];

  // Rolling 7-day window inclusive of today (today minus 6 days → today)
  const todayDate = new Date(today + "T00:00:00Z");
  const weekStart = new Date(todayDate.getTime() - 6 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const ids = rows.map((r) => r.id);
  const completions = await db
    .select({
      microtaskId: microtaskCompletions.microtaskId,
      completedDate: microtaskCompletions.completedDate,
      note: microtaskCompletions.note,
    })
    .from(microtaskCompletions)
    .where(
      and(
        eq(microtaskCompletions.userId, userId),
        inArray(microtaskCompletions.microtaskId, ids),
        gte(microtaskCompletions.completedDate, weekStart),
        lte(microtaskCompletions.completedDate, today)
      )
    );

  const byMicrotask = new Map<string, { count: number; todayNote: string | null; completedToday: boolean }>();
  for (const id of ids) {
    byMicrotask.set(id, { count: 0, todayNote: null, completedToday: false });
  }
  for (const c of completions) {
    const entry = byMicrotask.get(c.microtaskId);
    if (!entry) continue;
    entry.count += 1;
    if (c.completedDate === today) {
      entry.completedToday = true;
      entry.todayNote = c.note ?? null;
    }
  }

  return rows.map((row) => {
    const status = byMicrotask.get(row.id) ?? {
      count: 0,
      todayNote: null,
      completedToday: false,
    };
    return {
      ...row,
      completedToday: status.completedToday,
      todayNote: status.todayNote,
      completionCount7d: status.count,
      scheduledToday: Array.isArray(row.daysOfWeek) && row.daysOfWeek.includes(dayOfWeek),
    };
  });
}

/**
 * Idempotent: if a completion already exists for (microtaskId, completedDate),
 * returns it (updating the note if a new one was provided); otherwise inserts
 * and returns the new row.
 *
 * Note semantics:
 *   - note === undefined or null → leave any existing note untouched on conflict.
 *   - note is a string → write/overwrite it on conflict (so users can long-press
 *     after a one-tap completion and add a note).
 *
 * Validates ownership: returns null if the microtask isn't owned by userId.
 */
export async function completeMicrotask(
  microtaskId: string,
  userId: string,
  completedDate: string,
  note?: string | null
): Promise<typeof microtaskCompletions.$inferSelect | null> {
  const [owned] = await db
    .select({ id: microtasks.id })
    .from(microtasks)
    .where(and(eq(microtasks.id, microtaskId), eq(microtasks.userId, userId)))
    .limit(1);
  if (!owned) return null;

  const insert = db
    .insert(microtaskCompletions)
    .values({
      microtaskId,
      userId,
      completedDate,
      note: note ?? null,
    });

  const [row] =
    note != null
      ? await insert
          .onConflictDoUpdate({
            target: [microtaskCompletions.microtaskId, microtaskCompletions.completedDate],
            set: { note },
          })
          .returning()
      : await insert
          .onConflictDoNothing({
            target: [microtaskCompletions.microtaskId, microtaskCompletions.completedDate],
          })
          .returning();

  if (row) return row;

  // onConflictDoNothing path with no insert → row already exists, fetch it.
  const [existing] = await db
    .select()
    .from(microtaskCompletions)
    .where(
      and(
        eq(microtaskCompletions.microtaskId, microtaskId),
        eq(microtaskCompletions.completedDate, completedDate)
      )
    )
    .limit(1);
  return existing ?? null;
}

export async function uncompleteMicrotask(
  microtaskId: string,
  userId: string,
  completedDate: string
): Promise<boolean> {
  const deleted = await db
    .delete(microtaskCompletions)
    .where(
      and(
        eq(microtaskCompletions.microtaskId, microtaskId),
        eq(microtaskCompletions.userId, userId),
        eq(microtaskCompletions.completedDate, completedDate)
      )
    )
    .returning({ id: microtaskCompletions.id });
  return deleted.length > 0;
}



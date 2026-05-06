import { db } from "../index";
import { calendarEvents, userSettings } from "../schema";
import { eq, and, gt, lte, notInArray, sql } from "drizzle-orm";
import { getUserSettings } from "./users";

// ============================================================
// Calendar Events
// ============================================================
export async function getNextCalendarEvent(userId: string) {
  const now = new Date();
  const [event] = await db
    .select()
    .from(calendarEvents)
    .where(
      and(eq(calendarEvents.userId, userId), gt(calendarEvents.startTime, now))
    )
    .orderBy(calendarEvents.startTime)
    .limit(1);

  return event ?? null;
}

/**
 * Get the calendar event happening RIGHT NOW (started before now, ends after now).
 * Returns null if user is not currently in any event.
 */
export async function getCurrentCalendarEvent(userId: string) {
  const now = new Date();
  const [event] = await db
    .select()
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.userId, userId),
        lte(calendarEvents.startTime, now),
        gt(calendarEvents.endTime, now),
        eq(calendarEvents.isAllDay, false)
      )
    )
    .orderBy(calendarEvents.startTime)
    .limit(1);

  return event ?? null;
}

export async function upsertCalendarEvent(params: {
  userId: string;
  source: string;
  externalId: string;
  title: string;
  description: string | null;
  startTime: Date;
  endTime: Date;
  location: string | null;
  isAllDay: boolean;
  category?: string | null;
}) {
  const [result] = await db
    .insert(calendarEvents)
    .values({
      userId: params.userId,
      source: params.source,
      externalId: params.externalId,
      title: params.title,
      description: params.description,
      startTime: params.startTime,
      endTime: params.endTime,
      location: params.location,
      isAllDay: params.isAllDay,
      category: params.category ?? null,
      syncedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        calendarEvents.userId,
        calendarEvents.source,
        calendarEvents.externalId,
      ],
      set: {
        title: params.title,
        description: params.description,
        startTime: params.startTime,
        endTime: params.endTime,
        location: params.location,
        isAllDay: params.isAllDay,
        category: params.category ?? null,
        syncedAt: new Date(),
      },
    })
    .returning();

  return result;
}

export async function getCalendarEventsByDateRange(
  userId: string,
  start: Date,
  end: Date
) {
  // Include events that overlap with the range:
  // - events starting within the range, OR
  // - events that started before `start` but haven't ended yet (currently happening)
  return db
    .select()
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.userId, userId),
        lte(calendarEvents.startTime, end),
        gt(calendarEvents.endTime, start)
      )
    )
    .orderBy(calendarEvents.startTime);
}

export async function deleteStaleCalendarEvents(
  userId: string,
  source: string,
  currentExternalIds: string[]
) {
  if (currentExternalIds.length === 0) {
    return db
      .delete(calendarEvents)
      .where(
        and(
          eq(calendarEvents.userId, userId),
          eq(calendarEvents.source, source)
        )
      )
      .returning();
  }

  return db
    .delete(calendarEvents)
    .where(
      and(
        eq(calendarEvents.userId, userId),
        eq(calendarEvents.source, source),
        notInArray(calendarEvents.externalId, currentExternalIds)
      )
    )
    .returning();
}

export async function deleteCalendarEvent(id: string, userId: string) {
  const [deleted] = await db
    .delete(calendarEvents)
    .where(and(eq(calendarEvents.id, id), eq(calendarEvents.userId, userId)))
    .returning();
  return deleted ?? null;
}

export async function updateCalendarEvent(
  id: string,
  userId: string,
  data: Partial<{
    title: string;
    description: string | null;
    startTime: Date;
    endTime: Date;
    location: string | null;
    category: string | null;
  }>
) {
  const [updated] = await db
    .update(calendarEvents)
    .set({ ...data, syncedAt: new Date() })
    .where(and(eq(calendarEvents.id, id), eq(calendarEvents.userId, userId)))
    .returning();
  return updated ?? null;
}

export async function createManualCalendarEvent(params: {
  userId: string;
  title: string;
  description: string | null;
  startTime: Date;
  endTime: Date;
  location: string | null;
  isAllDay: boolean;
  seriesId: string | null;
  category?: string | null;
}) {
  const externalId = `manual-${crypto.randomUUID()}`;
  const [event] = await db
    .insert(calendarEvents)
    .values({
      userId: params.userId,
      source: "controlledchaos",
      externalId,
      title: params.title,
      description: params.description,
      startTime: params.startTime,
      endTime: params.endTime,
      location: params.location,
      isAllDay: params.isAllDay,
      category: params.category ?? null,
      seriesId: params.seriesId,
      syncedAt: new Date(),
    })
    .returning();
  return event;
}

export async function createCalendarEventsFromDump(
  userId: string,
  dumpId: string,
  events: Array<{
    title: string;
    description: string | null;
    startTime: Date;
    endTime: Date;
    location: string | null;
    isAllDay: boolean;
    seriesId: string | null;
    category?: string | null;
  }>
) {
  if (events.length === 0) return [];
  const values = events.map((evt) => ({
    userId,
    source: "controlledchaos" as const,
    externalId: `dump-${crypto.randomUUID()}`,
    ...evt,
    category: evt.category ?? null,
    sourceDumpId: dumpId,
    syncedAt: new Date(),
  }));
  return db.insert(calendarEvents).values(values).returning();
}

export async function deleteCalendarEventsBySeries(
  seriesId: string,
  userId: string
) {
  return db
    .delete(calendarEvents)
    .where(
      and(
        eq(calendarEvents.seriesId, seriesId),
        eq(calendarEvents.userId, userId)
      )
    )
    .returning();
}

export async function updateCalendarEventSeries(
  seriesId: string,
  userId: string,
  data: { title?: string; description?: string | null; location?: string | null; isAllDay?: boolean; category?: string | null }
) {
  return db
    .update(calendarEvents)
    .set({ ...data, syncedAt: new Date() })
    .where(
      and(
        eq(calendarEvents.seriesId, seriesId),
        eq(calendarEvents.userId, userId)
      )
    )
    .returning();
}


// ============================================================
// Calendar Export Token
// ============================================================

export async function getOrCreateCalendarExportToken(userId: string): Promise<string> {
  const settings = await getUserSettings(userId);
  if (settings?.calendarExportToken) {
    return settings.calendarExportToken;
  }
  const token = crypto.randomUUID();
  await db
    .update(userSettings)
    .set({ calendarExportToken: token })
    .where(eq(userSettings.userId, userId));
  return token;
}

export async function regenerateCalendarExportToken(userId: string): Promise<string> {
  const token = crypto.randomUUID();
  await db
    .update(userSettings)
    .set({ calendarExportToken: token })
    .where(eq(userSettings.userId, userId));
  return token;
}

export async function getUserIdByCalendarToken(token: string): Promise<string | null> {
  const [row] = await db
    .select({ userId: userSettings.userId })
    .from(userSettings)
    .where(eq(userSettings.calendarExportToken, token))
    .limit(1);
  return row?.userId ?? null;
}

/**
 * Get the most recent syncedAt timestamp for a user's calendar events.
 * Returns null if no events exist.
 */
export async function getLastCalendarSync(userId: string): Promise<Date | null> {
  const [row] = await db
    .select({ lastSync: sql<string>`MAX(${calendarEvents.syncedAt})` })
    .from(calendarEvents)
    .where(eq(calendarEvents.userId, userId));

  return row?.lastSync ? new Date(row.lastSync) : null;
}



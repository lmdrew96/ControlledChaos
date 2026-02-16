import {
  getGoogleAccessToken,
  getAllGoogleAccessTokens,
} from "./google-auth";
import { createGoogleCalendarClient } from "./google";
import {
  upsertCalendarEvent,
  deleteStaleCalendarEvents,
} from "@/lib/db/queries";
import type { CalendarSyncResult } from "@/types";

const MAX_EVENTS = 500;

/**
 * Sync events from ALL connected Google Calendars into the DB.
 * Each account's events get a prefixed externalId to avoid conflicts.
 */
export async function syncGoogleCalendar(
  userId: string,
  calendarIds?: string[] | null
): Promise<CalendarSyncResult> {
  const accounts = await getAllGoogleAccessTokens(userId);
  if (accounts.length === 0) {
    throw new Error(
      "Google Calendar not connected. Connect it in Settings."
    );
  }

  // Sync window: 30 days back to 90 days forward
  const now = new Date();
  const timeMin = new Date(now);
  timeMin.setDate(timeMin.getDate() - 30);
  const timeMax = new Date(now);
  timeMax.setDate(timeMax.getDate() + 90);

  let totalCreated = 0;
  const allExternalIds: string[] = [];

  for (const account of accounts) {
    const gcal = createGoogleCalendarClient(account.token);

    let events;
    try {
      events = await gcal.listEvents({
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        maxResults: MAX_EVENTS,
        calendarIds: calendarIds?.length ? calendarIds : undefined,
      });
    } catch (err) {
      console.error(
        `[Calendar] Google sync failed for ${account.email ?? account.accountId}:`,
        err
      );
      continue; // Skip this account, try the next
    }

    for (const event of events) {
      if (!event.id || event.status === "cancelled") continue;

      // Skip events created by ControlledChaos to avoid duplicates
      const title = event.summary ?? "";
      if (title.startsWith("[CC]") || title.startsWith("[CC] ")) continue;

      // Prefix externalId with account ID to avoid conflicts between accounts
      const externalId = `${account.accountId}:${event.id}`;
      allExternalIds.push(externalId);

      const isAllDay = !!event.start.date && !event.start.dateTime;
      const startTime = new Date(event.start.dateTime ?? event.start.date!);
      const endTime = new Date(event.end.dateTime ?? event.end.date!);

      await upsertCalendarEvent({
        userId,
        source: "google",
        externalId,
        title: event.summary || "Untitled Event",
        description: event.description ?? null,
        startTime,
        endTime,
        location: event.location ?? null,
        isAllDay,
      });

      totalCreated++;
    }

    console.log(
      `[Calendar] Google sync (${account.email ?? account.accountId}): ${events.length} events`
    );
  }

  // Delete events no longer in any Google account
  const deleted = await deleteStaleCalendarEvents(
    userId,
    "google",
    allExternalIds
  );

  console.log(
    `[Calendar] Google sync total: ${totalCreated} synced, ${deleted.length} deleted`
  );

  return {
    created: totalCreated,
    updated: 0,
    deleted: deleted.length,
    total: allExternalIds.length,
  };
}

/**
 * Write a scheduled time block to Google Calendar.
 * Writes to the first connected Google account.
 * Returns the Google event ID for storing as externalId, or null on failure.
 */
export async function writeEventToGoogle(
  userId: string,
  event: {
    title: string;
    description?: string;
    startTime: string;
    endTime: string;
    timezone: string;
  }
): Promise<string | null> {
  const accessToken = await getGoogleAccessToken(userId);
  if (!accessToken) return null;

  const gcal = createGoogleCalendarClient(accessToken);

  try {
    const created = await gcal.createEvent({
      summary: event.title,
      description: event.description,
      start: { dateTime: event.startTime, timeZone: event.timezone },
      end: { dateTime: event.endTime, timeZone: event.timezone },
    });
    return created.id;
  } catch (error) {
    console.error("[Calendar] Failed to write to Google Calendar:", error);
    return null;
  }
}

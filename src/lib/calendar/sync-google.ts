import { getGoogleAccessToken } from "./google-auth";
import { createGoogleCalendarClient } from "./google";
import {
  upsertCalendarEvent,
  deleteStaleCalendarEvents,
} from "@/lib/db/queries";
import type { CalendarSyncResult } from "@/types";

const MAX_EVENTS = 500;

/**
 * Sync events from the user's primary Google Calendar into the DB.
 * Mirrors the sync-canvas.ts pattern.
 */
export async function syncGoogleCalendar(
  userId: string
): Promise<CalendarSyncResult> {
  const accessToken = await getGoogleAccessToken(userId);
  if (!accessToken) {
    throw new Error(
      "Google Calendar not connected. Connect it in Settings."
    );
  }

  const gcal = createGoogleCalendarClient(accessToken);

  // Sync window: 30 days back to 90 days forward
  const now = new Date();
  const timeMin = new Date(now);
  timeMin.setDate(timeMin.getDate() - 30);
  const timeMax = new Date(now);
  timeMax.setDate(timeMax.getDate() + 90);

  const events = await gcal.listEvents({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    maxResults: MAX_EVENTS,
  });

  let created = 0;
  let updated = 0;
  const currentExternalIds: string[] = [];

  for (const event of events) {
    if (!event.id || event.status === "cancelled") continue;

    currentExternalIds.push(event.id);

    const isAllDay = !!event.start.date && !event.start.dateTime;
    const startTime = new Date(event.start.dateTime ?? event.start.date!);
    const endTime = new Date(event.end.dateTime ?? event.end.date!);

    await upsertCalendarEvent({
      userId,
      source: "google",
      externalId: event.id,
      title: event.summary || "Untitled Event",
      description: event.description ?? null,
      startTime,
      endTime,
      location: event.location ?? null,
      isAllDay,
    });

    created++;
  }

  // Delete events no longer in Google
  const deleted = await deleteStaleCalendarEvents(
    userId,
    "google",
    currentExternalIds
  );

  console.log(
    `[Calendar] Google sync: ${created} synced, ${deleted.length} deleted`
  );

  return {
    created,
    updated,
    deleted: deleted.length,
    total: currentExternalIds.length,
  };
}

/**
 * Write a scheduled time block to Google Calendar.
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

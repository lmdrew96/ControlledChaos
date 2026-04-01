import ical, { VEvent, ParameterValue } from "node-ical";
import {
  upsertCalendarEvent,
  deleteStaleCalendarEvents,
} from "@/lib/db/queries";
import type { CalendarSyncResult } from "@/types";

const MAX_EVENTS = 500;

// Canvas assignment/quiz/discussion UIDs contain these substrings
const ASSIGNMENT_UID_PATTERNS = ["assignment", "quiz", "discussion_topic"];

function isAssignmentEvent(uid: string): boolean {
  return ASSIGNMENT_UID_PATTERNS.some((p) => uid.includes(p));
}

/** Rewrite an all-day date to 23:59:00 UTC on the same calendar date. */
function toEndOfDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(23, 59, 0, 0);
  return d;
}

/** Extract the string value from a node-ical ParameterValue field. */
function paramValue(val: ParameterValue | undefined): string | null {
  if (!val) return null;
  if (typeof val === "string") return val;
  return val.val ?? null;
}

export async function syncCanvasCalendar(
  userId: string,
  icalUrl: string
): Promise<CalendarSyncResult> {
  if (!icalUrl.startsWith("https://")) {
    throw new Error("Canvas iCal URL must use HTTPS");
  }

  // Fetch the .ics feed
  const response = await fetch(icalUrl, {
    headers: { Accept: "text/calendar" },
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch Canvas calendar: ${response.status} ${response.statusText}`
    );
  }

  const icsText = await response.text();

  // Parse with node-ical (sync parse is fine — the text is already in memory)
  const parsed = ical.sync.parseICS(icsText);

  // Extract VEVENTs
  const events: VEvent[] = [];
  for (const key of Object.keys(parsed)) {
    const component = parsed[key];
    if (component && "type" in component && component.type === "VEVENT") {
      events.push(component as VEvent);
    }
  }

  if (events.length > MAX_EVENTS) {
    console.warn(
      `[Calendar] Canvas feed has ${events.length} events, limiting to ${MAX_EVENTS}`
    );
    events.length = MAX_EVENTS;
  }

  // Upsert each event
  let synced = 0;
  const currentExternalIds: string[] = [];

  for (const event of events) {
    const uid = event.uid;
    if (!uid) continue;

    currentExternalIds.push(uid);

    let startDate =
      event.start instanceof Date ? event.start : new Date(event.start);
    let endDate = event.end
      ? event.end instanceof Date
        ? event.end
        : new Date(event.end)
      : startDate;

    let isAllDay = event.datetype === "date";

    // Convert Canvas assignment all-day events to timed events at 23:59 UTC.
    // Canvas defaults assignments to 11:59 PM — iCal loses the time for VALUE=DATE entries.
    if (isAllDay && isAssignmentEvent(uid)) {
      startDate = toEndOfDay(startDate);
      endDate = new Date(startDate);
      isAllDay = false;
    }

    await upsertCalendarEvent({
      userId,
      source: "canvas",
      externalId: uid,
      title: paramValue(event.summary) ?? "Untitled Event",
      description: paramValue(event.description),
      startTime: startDate,
      endTime: endDate,
      location: paramValue(event.location),
      isAllDay,
    });

    synced++;
  }

  // Delete stale events no longer in the feed
  const deleted = await deleteStaleCalendarEvents(
    userId,
    "canvas",
    currentExternalIds
  );

  console.log(
    `[Calendar] Canvas sync: ${synced} synced, ${deleted.length} deleted`
  );

  return {
    created: synced,
    updated: 0,
    deleted: deleted.length,
    total: currentExternalIds.length,
  };
}

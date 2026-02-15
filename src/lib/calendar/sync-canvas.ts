import ical, { VEvent, ParameterValue } from "node-ical";
import {
  upsertCalendarEvent,
  deleteStaleCalendarEvents,
} from "@/lib/db/queries";
import type { CalendarSyncResult } from "@/types";

const MAX_EVENTS = 500;

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

    const startDate =
      event.start instanceof Date ? event.start : new Date(event.start);
    const endDate = event.end
      ? event.end instanceof Date
        ? event.end
        : new Date(event.end)
      : startDate;

    const isAllDay = event.datetype === "date";

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

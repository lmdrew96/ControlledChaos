/**
 * Travel time between calendar events at different saved locations.
 *
 * Without them, a plan could put a sitting in the 15 minutes the user spends
 * walking from one building to the next. These helpers turn "class at
 * Smith Hall, then a meeting at Home" into a busy "Travel to Home" interval
 * that every busy-time calculation can treat like any other event.
 *
 * Pure: callers load saved locations and commute rows (getCommuteSetup).
 */

import type { CalendarEvent } from "@/types";

interface SavedLocation {
  id: string;
  name: string;
}

interface CommuteRow {
  fromLocationId: string;
  toLocationId: string;
  travelMinutes: number;
}

interface LocatedEvent {
  startTime: Date | string;
  endTime: Date | string;
  isAllDay?: boolean | null;
  location: string | null;
}

export interface TravelBuffer {
  start: Date;
  end: Date;
  destination: string;
  minutes: number;
}

/** Whether `phrase` appears in `text` as whole words, case-insensitively. */
function containsWords(text: string, phrase: string): boolean {
  const escaped = phrase.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!escaped) return false;
  // \b fails next to punctuation-only edges, so bound on non-word-or-edge.
  return new RegExp(`(^|\\W)${escaped}(\\W|$)`, "i").test(text);
}

/**
 * Match a calendar event's location string to a saved location by name.
 *
 * Whole-word containment in either direction: "Smith Hall Room 101" matches a
 * saved "Smith Hall", and "Campus" matches an event at "Campus". Plain
 * substring matching used to let "Home" match "Homework Lab".
 */
export function matchEventLocationToSavedLocation(
  eventLocation: string | null,
  savedLocations: SavedLocation[]
): SavedLocation | null {
  if (!eventLocation?.trim()) return null;

  for (const loc of savedLocations) {
    if (
      containsWords(eventLocation, loc.name) ||
      containsWords(loc.name, eventLocation)
    ) {
      return loc;
    }
  }

  return null;
}

/**
 * Minutes from one saved location to another: the shortest across travel
 * modes, as leave-now pushes use. null when no commute has been saved.
 */
export function shortestCommuteMinutes(
  fromLocationId: string,
  toLocationId: string,
  commutes: CommuteRow[]
): number | null {
  let best: number | null = null;
  for (const c of commutes) {
    if (c.fromLocationId !== fromLocationId || c.toLocationId !== toLocationId) continue;
    if (best === null || c.travelMinutes < best) best = c.travelMinutes;
  }
  return best;
}

/**
 * Travel intervals the user needs between events.
 *
 * Walks timed events in start order, tracking where the user last was. When
 * the next event is at a different saved location with a known commute, the
 * minutes before it are travel: [start − commute, start], never reaching back
 * before the previous event ended (so a buffer never overlaps an earlier
 * event, and a short gap simply becomes all travel).
 *
 * - An event with no location doesn't move the user.
 * - An event at an unrecognised location means we no longer know where they
 *   are, so no buffer is guessed for the next hop.
 * - The first located event gets no buffer: there's no live position, and
 *   guessing an origin (e.g. "home until the first event") made pushes claim
 *   "you're still at home" while the user was already driving there.
 * - `now` floors every buffer so none lands in the past.
 */
export function travelBuffers(
  events: LocatedEvent[],
  savedLocations: SavedLocation[],
  commutes: CommuteRow[],
  opts: { now?: Date } = {}
): TravelBuffer[] {
  if (savedLocations.length === 0 || commutes.length === 0) return [];

  const timed = events
    .filter((e) => !e.isAllDay)
    .map((e) => ({
      start: new Date(e.startTime),
      end: new Date(e.endTime),
      location: e.location,
    }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const buffers: TravelBuffer[] = [];
  let lastLocationId: string | null = null;
  let lastEndMs = opts.now?.getTime() ?? -Infinity;

  for (const e of timed) {
    if (e.location?.trim()) {
      const match = matchEventLocationToSavedLocation(e.location, savedLocations);
      if (!match) {
        lastLocationId = null;
      } else {
        if (lastLocationId && lastLocationId !== match.id) {
          const minutes = shortestCommuteMinutes(lastLocationId, match.id, commutes);
          if (minutes !== null && minutes > 0) {
            const startMs = Math.max(e.start.getTime() - minutes * 60_000, lastEndMs);
            if (startMs < e.start.getTime()) {
              buffers.push({
                start: new Date(startMs),
                end: e.start,
                destination: match.name,
                minutes,
              });
            }
          }
        }
        lastLocationId = match.id;
      }
    }
    lastEndMs = Math.max(lastEndMs, e.end.getTime());
  }

  return buffers;
}

export interface BusyRow {
  title: string;
  startTime: Date;
  endTime: Date;
  isAllDay: boolean;
}

/**
 * Events plus the travel between them, as one start-ordered busy list.
 *
 * The one place crisis busy time is built: the cron, the in-app status check
 * and the manual rescue route all call this. The status check used to skip
 * the travel, so it resolved every detection the cron had just created and
 * the next tick re-created it.
 */
export function withTravelBuffers(
  events: Array<LocatedEvent & { title: string }>,
  commute: { savedLocations: SavedLocation[]; commutes: CommuteRow[] },
  now: Date
): BusyRow[] {
  const rows: BusyRow[] = events.map((e) => ({
    title: e.title,
    startTime: new Date(e.startTime),
    endTime: new Date(e.endTime),
    isAllDay: e.isAllDay ?? false,
  }));
  for (const b of travelBuffers(events, commute.savedLocations, commute.commutes, { now })) {
    rows.push({ title: `Travel to ${b.destination}`, startTime: b.start, endTime: b.end, isAllDay: false });
  }
  return rows.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
}

/**
 * Travel buffers in the CalendarEvent shape the scheduler's busy set uses.
 * Titled "Travel to X" so a conflict message names what's in the way.
 */
export function travelBuffersAsBusyIntervals(buffers: TravelBuffer[]): CalendarEvent[] {
  return buffers.map((b) => ({
    id: `travel-${b.start.getTime()}`,
    userId: "",
    source: "controlledchaos" as const,
    externalId: null,
    title: `Travel to ${b.destination}`,
    description: null,
    startTime: b.start.toISOString(),
    endTime: b.end.toISOString(),
    location: null,
    category: null,
    isAllDay: false,
    seriesId: null,
    sourceDumpId: null,
    syncedAt: b.start.toISOString(),
  }));
}

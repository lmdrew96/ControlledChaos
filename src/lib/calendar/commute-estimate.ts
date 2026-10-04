/**
 * Commute times between saved locations, computed in the background.
 *
 * Users used to fill in a commute for every pair of saved locations by hand
 * (or click "estimate" per pair); with six places that was fifteen rows. Now
 * every pair is computed from the pins in one OSRM /table request whenever
 * locations or the travel mode change, and the calendar-sync cron fills any
 * pairs a failed request left missing (getUsersWithIncompleteCommutes).
 *
 * One row per direction, in one mode: short hops (under SHORT_HOP_METERS) are
 * always walked, everything else uses the user's travel mode. Storing a single
 * mode matters because readers take the shortest row per pair, so storing all
 * modes would make every hop a drive.
 */

import type { TravelMode } from "@/types";
import {
  getSavedLocations,
  getUserSettings,
  replaceCommuteTimes,
} from "@/lib/db/queries";

/** Pairs closer than this are timed as walking whatever the travel mode. */
export const SHORT_HOP_METERS = 1000;

// The public OSRM demo only serves the car profile, so walking and cycling are
// derived from the car route's distance at an average speed.
const SPEED_KMH: Record<Exclude<TravelMode, "driving">, number> = {
  walking: 5,
  cycling: 15,
};
// When OSRM can't route a pair: straight-line distance, stretched for roads.
const DETOUR_FACTOR = 1.3;
const FALLBACK_DRIVING_KMH = 40;

export interface CommuteLeg {
  mode: TravelMode;
  minutes: number;
}

/**
 * Pick the mode and minutes for one directed pair. `durationSec` is the
 * driving time from OSRM, null when it couldn't route the pair (then the
 * distance is straight-line and gets the detour factor).
 */
export function chooseCommute(
  distanceM: number,
  durationSec: number | null,
  travelMode: TravelMode
): CommuteLeg {
  const mode: TravelMode = distanceM < SHORT_HOP_METERS ? "walking" : travelMode;
  const km = (distanceM / 1000) * (durationSec == null ? DETOUR_FACTOR : 1);

  let minutes: number;
  if (mode === "driving") {
    minutes = durationSec != null ? durationSec / 60 : (km / FALLBACK_DRIVING_KMH) * 60;
  } else {
    minutes = (km / SPEED_KMH[mode]) * 60;
  }
  return { mode, minutes: Math.max(1, Math.round(minutes)) };
}

function straightLineMeters(a: Coordinate, b: Coordinate): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

interface Coordinate {
  lat: number;
  lng: number;
}

interface OSRMTable {
  durations: Array<Array<number | null>>;
  distances: Array<Array<number | null>>;
}

async function fetchOSRMTable(coords: Coordinate[]): Promise<OSRMTable> {
  const path = coords.map((c) => `${c.lng},${c.lat}`).join(";");
  const res = await fetch(
    `https://router.project-osrm.org/table/v1/car/${path}?annotations=duration,distance`,
    {
      headers: { "User-Agent": "ControlledChaos/1.0" },
      signal: AbortSignal.timeout(15000),
    }
  );
  if (!res.ok) throw new Error(`OSRM table request failed: ${res.status}`);
  const data = (await res.json()) as { code: string } & Partial<OSRMTable>;
  if (data.code !== "Ok" || !data.durations || !data.distances) {
    throw new Error(`OSRM table returned ${data.code}`);
  }
  return { durations: data.durations, distances: data.distances };
}

/**
 * Recompute every commute between the user's saved locations and replace the
 * stored ones. Throws when OSRM is unreachable, leaving the old rows in place;
 * callers that are saving something else should catch and log.
 */
export async function refreshCommuteTimes(userId: string): Promise<void> {
  const [saved, settings] = await Promise.all([
    getSavedLocations(userId),
    getUserSettings(userId),
  ]);
  const travelMode = (settings?.travelMode as TravelMode | undefined) ?? "driving";

  const located = saved.flatMap((l) => {
    const lat = Number(l.latitude);
    const lng = Number(l.longitude);
    return l.latitude != null && l.longitude != null && Number.isFinite(lat) && Number.isFinite(lng)
      ? [{ id: l.id, lat, lng }]
      : [];
  });

  if (located.length < 2) {
    await replaceCommuteTimes(userId, []);
    return;
  }

  const table = await fetchOSRMTable(located);

  const rows = located.flatMap((from, i) =>
    located.flatMap((to, j) => {
      if (i === j) return [];
      const routedDistance = table.distances[i]?.[j] ?? null;
      const duration = routedDistance == null ? null : table.durations[i]?.[j] ?? null;
      const leg = chooseCommute(
        routedDistance ?? straightLineMeters(from, to),
        duration,
        travelMode
      );
      return [
        {
          userId,
          fromLocationId: from.id,
          toLocationId: to.id,
          travelMode: leg.mode,
          travelMinutes: leg.minutes,
        },
      ];
    })
  );

  await replaceCommuteTimes(userId, rows);
}

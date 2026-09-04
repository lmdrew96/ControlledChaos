import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { MAX_COMMUTE_ESTIMATE_PAIRS } from "@/types";

type TravelMode = "driving" | "walking" | "cycling";

const OSRM_PROFILES: Record<TravelMode, string> = {
  driving: "car",
  walking: "foot",
  cycling: "bike",
};

interface EstimateRequest {
  pairs: Array<{
    fromLat: number;
    fromLng: number;
    toLat: number;
    toLng: number;
  }>;
  mode: TravelMode;
}

interface OSRMTableResponse {
  code: string;
  durations?: Array<Array<number | null>>;
  distances?: Array<Array<number | null>>;
}

// Average speeds (km/h) used when the OSRM public server lacks a profile
const FALLBACK_SPEEDS: Record<string, number> = {
  foot: 5,
  bike: 15,
};

// OSRM's demo server caps /table coordinates. 20 pairs can only reference 40
// distinct points, so this is a guard rail rather than a live limit — but it
// keeps the failure legible if MAX_COMMUTE_ESTIMATE_PAIRS is ever raised.
const MAX_TABLE_COORDINATES = 100;

interface Coordinate {
  lat: number;
  lng: number;
}

/** Stable key for coordinate de-duplication. */
function coordKey(lat: number, lng: number): string {
  return `${lat},${lng}`;
}

/**
 * Ask OSRM for the full duration/distance matrix over a set of points.
 *
 * This is the whole point of /table: N locations resolve in ONE request instead
 * of the N(N-1)/2 individual /route calls this used to make. Fifteen saved
 * locations went from 105 requests against a free public server to 1.
 */
async function fetchOSRMTable(
  coords: Coordinate[],
  profile: string
): Promise<OSRMTableResponse | null> {
  const path = coords.map((c) => `${c.lng},${c.lat}`).join(";");
  const url = `https://router.project-osrm.org/table/v1/${profile}/${path}?annotations=duration,distance`;

  const res = await fetch(url, {
    headers: { "User-Agent": "ControlledChaos/1.0" },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) return null;

  const data = (await res.json()) as OSRMTableResponse;
  if (data.code !== "Ok" || !data.durations) return null;

  return data;
}

// POST — estimate commute times for one or more coordinate pairs via OSRM
export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as EstimateRequest;
    const { pairs, mode } = body;

    if (!pairs?.length) {
      return NextResponse.json(
        { error: "At least one coordinate pair is required" },
        { status: 400 }
      );
    }

    if (!mode || !OSRM_PROFILES[mode]) {
      return NextResponse.json(
        { error: "Invalid travel mode. Use: driving, walking, or cycling" },
        { status: 400 }
      );
    }

    if (pairs.length > MAX_COMMUTE_ESTIMATE_PAIRS) {
      return NextResponse.json(
        { error: `Maximum ${MAX_COMMUTE_ESTIMATE_PAIRS} pairs per request` },
        { status: 400 }
      );
    }

    // Coordinates are interpolated straight into the outbound OSRM URL, so
    // check them here. Without this a NaN (a location saved with an
    // unparseable lat/lng) produced a malformed request and came back as a
    // per-pair "Route not found", which reads like the route genuinely doesn't
    // exist rather than like bad input.
    const badPair = pairs.findIndex(
      (p) =>
        !Number.isFinite(p.fromLat) ||
        !Number.isFinite(p.fromLng) ||
        !Number.isFinite(p.toLat) ||
        !Number.isFinite(p.toLng) ||
        Math.abs(p.fromLat) > 90 ||
        Math.abs(p.toLat) > 90 ||
        Math.abs(p.fromLng) > 180 ||
        Math.abs(p.toLng) > 180
    );
    if (badPair !== -1) {
      return NextResponse.json(
        {
          error: `Pair ${badPair + 1} has invalid coordinates. Check the latitude and longitude on those saved locations.`,
        },
        { status: 400 }
      );
    }

    const profile = OSRM_PROFILES[mode];

    // Collapse every endpoint in the request to a set of distinct points. Pairs
    // overlap heavily — six locations produce 15 pairs but only 6 points — so
    // this is where most of the old request count disappeared.
    const coords: Coordinate[] = [];
    const indexOfCoord = new Map<string, number>();
    const pointIndex = (lat: number, lng: number): number => {
      const key = coordKey(lat, lng);
      const existing = indexOfCoord.get(key);
      if (existing !== undefined) return existing;
      const next = coords.length;
      coords.push({ lat, lng });
      indexOfCoord.set(key, next);
      return next;
    };

    const pairIndices = pairs.map((p) => ({
      from: pointIndex(p.fromLat, p.fromLng),
      to: pointIndex(p.toLat, p.toLng),
    }));

    if (coords.length > MAX_TABLE_COORDINATES) {
      return NextResponse.json(
        {
          error: `Too many distinct locations in one request (${coords.length}, max ${MAX_TABLE_COORDINATES}).`,
        },
        { status: 400 }
      );
    }

    // One matrix request for the requested profile.
    let table = await fetchOSRMTable(coords, profile);

    // The public OSRM demo only serves "car". For walking and cycling, fall
    // back to the car matrix and derive time from distance at an average speed
    // — same fallback the per-pair version used, one request instead of N.
    const fallbackSpeed: number | undefined = FALLBACK_SPEEDS[profile];
    const usingFallback = !table && fallbackSpeed !== undefined;
    if (usingFallback) {
      table = await fetchOSRMTable(coords, "car");
    }

    const durations = table?.durations;
    const distances = table?.distances;

    const results = pairs.map((pair, i) => {
      const { from, to } = pairIndices[i];
      const durationSec = durations?.[from]?.[to] ?? null;
      const distanceM = distances?.[from]?.[to] ?? null;

      const base = {
        fromLat: pair.fromLat,
        fromLng: pair.fromLng,
        toLat: pair.toLat,
        toLng: pair.toLng,
      };

      // In fallback mode the durations are car durations, so they're the wrong
      // answer for a walk — distance is the only usable signal.
      if (usingFallback && fallbackSpeed !== undefined) {
        if (distanceM == null) {
          return { ...base, minutes: null, distanceKm: null, error: "Route not found" };
        }
        const distanceKm = distanceM / 1000;
        return {
          ...base,
          minutes: Math.max(Math.round((distanceKm / fallbackSpeed) * 60), 1),
          distanceKm: Math.round(distanceKm * 10) / 10,
          error: null,
        };
      }

      if (durationSec == null) {
        return { ...base, minutes: null, distanceKm: null, error: "Route not found" };
      }

      return {
        ...base,
        minutes: Math.round(durationSec / 60),
        distanceKm:
          distanceM == null ? null : Math.round((distanceM / 1000) * 10) / 10,
        error: null,
      };
    });

    return NextResponse.json({ estimates: results });
  } catch (error) {
    console.error("[API] POST /api/locations/commute-times/estimate error:", error);
    return NextResponse.json(
      { error: "Failed to estimate commute times" },
      { status: 500 }
    );
  }
}

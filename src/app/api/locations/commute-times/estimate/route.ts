import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

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

interface OSRMResponse {
  code: string;
  routes?: Array<{
    duration: number; // seconds
    distance: number; // meters
  }>;
}

async function getOSRMEstimate(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
  profile: string
): Promise<{ minutes: number; distanceKm: number } | null> {
  const url = `https://router.project-osrm.org/route/v1/${profile}/${fromLng},${fromLat};${toLng},${toLat}?overview=false`;

  const res = await fetch(url, {
    headers: { "User-Agent": "ControlledChaos/1.0" },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) return null;

  const data = (await res.json()) as OSRMResponse;

  if (data.code !== "Ok" || !data.routes?.length) return null;

  const route = data.routes[0];
  return {
    minutes: Math.round(route.duration / 60),
    distanceKm: Math.round((route.distance / 1000) * 10) / 10,
  };
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

    if (pairs.length > 20) {
      return NextResponse.json(
        { error: "Maximum 20 pairs per request" },
        { status: 400 }
      );
    }

    const profile = OSRM_PROFILES[mode];

    // Fetch all estimates concurrently (OSRM handles individual route requests)
    const results = await Promise.all(
      pairs.map(async (pair) => {
        const estimate = await getOSRMEstimate(
          pair.fromLat,
          pair.fromLng,
          pair.toLat,
          pair.toLng,
          profile
        );
        return {
          fromLat: pair.fromLat,
          fromLng: pair.fromLng,
          toLat: pair.toLat,
          toLng: pair.toLng,
          minutes: estimate?.minutes ?? null,
          distanceKm: estimate?.distanceKm ?? null,
          error: estimate ? null : "Route not found",
        };
      })
    );

    return NextResponse.json({ estimates: results });
  } catch (error) {
    console.error("[API] POST /api/locations/commute-times/estimate error:", error);
    return NextResponse.json(
      { error: "Failed to estimate commute times" },
      { status: 500 }
    );
  }
}

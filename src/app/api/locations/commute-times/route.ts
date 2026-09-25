import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  getCommuteTimes,
  upsertCommuteTime,
  deleteCommuteTime,
  getSavedLocations,
} from "@/lib/db/queries";

// GET — fetch all commute times for the user
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const times = await getCommuteTimes(userId);
    return NextResponse.json({ commuteTimes: times });
  } catch (error) {
    console.error("[API] GET /api/locations/commute-times error:", error);
    return NextResponse.json({ error: "Failed to fetch commute times" }, { status: 500 });
  }
}

// POST — create or update a commute time between two locations
export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { fromLocationId, toLocationId, travelMinutes, travelMode } = body as {
      fromLocationId: string;
      toLocationId: string;
      travelMinutes: number;
      travelMode?: string;
    };

    const mode = travelMode ?? "driving";

    if (!fromLocationId || !toLocationId) {
      return NextResponse.json({ error: "Both location IDs are required" }, { status: 400 });
    }
    if (fromLocationId === toLocationId) {
      return NextResponse.json({ error: "Cannot set commute time to same location" }, { status: 400 });
    }
    if (typeof travelMinutes !== "number" || travelMinutes < 0) {
      return NextResponse.json({ error: "travelMinutes must be a non-negative number" }, { status: 400 });
    }

    // Both ends must be this user's own saved locations. The upsert matches
    // on the location pair, so without this a foreign id could overwrite
    // someone else's commute row.
    const owned = new Set((await getSavedLocations(userId)).map((l) => l.id));
    if (!owned.has(fromLocationId) || !owned.has(toLocationId)) {
      return NextResponse.json({ error: "Location not found" }, { status: 404 });
    }

    // Upsert both directions (A→B and B→A are the same commute)
    await Promise.all([
      upsertCommuteTime(userId, fromLocationId, toLocationId, travelMinutes, mode),
      upsertCommuteTime(userId, toLocationId, fromLocationId, travelMinutes, mode),
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[API] POST /api/locations/commute-times error:", error);
    return NextResponse.json({ error: "Failed to save commute time" }, { status: 500 });
  }
}

// DELETE — remove a commute time between two locations
export async function DELETE(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const fromLocationId = searchParams.get("from");
    const toLocationId = searchParams.get("to");
    const mode = searchParams.get("mode") ?? "driving";

    if (!fromLocationId || !toLocationId) {
      return NextResponse.json({ error: "Both location IDs are required" }, { status: 400 });
    }

    // Delete both directions for the specified mode
    await Promise.all([
      deleteCommuteTime(userId, fromLocationId, toLocationId, mode),
      deleteCommuteTime(userId, toLocationId, fromLocationId, mode),
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[API] DELETE /api/locations/commute-times error:", error);
    return NextResponse.json({ error: "Failed to delete commute time" }, { status: 500 });
  }
}

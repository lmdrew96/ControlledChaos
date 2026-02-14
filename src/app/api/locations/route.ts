import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getSavedLocations, createLocation } from "@/lib/db/queries";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const locations = await getSavedLocations(userId);
    return NextResponse.json({ locations });
  } catch (error) {
    console.error("[API] GET /api/locations error:", error);
    return NextResponse.json(
      { error: "Failed to fetch locations" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, latitude, longitude, radiusMeters } = body as {
      name: string;
      latitude: number;
      longitude: number;
      radiusMeters?: number;
    };

    if (!name?.trim()) {
      return NextResponse.json(
        { error: "Location name is required" },
        { status: 400 }
      );
    }

    if (latitude == null || longitude == null) {
      return NextResponse.json(
        { error: "Latitude and longitude are required" },
        { status: 400 }
      );
    }

    const location = await createLocation({
      userId,
      name: name.trim(),
      latitude: latitude.toString(),
      longitude: longitude.toString(),
      radiusMeters,
    });

    return NextResponse.json({ location }, { status: 201 });
  } catch (error) {
    console.error("[API] POST /api/locations error:", error);
    return NextResponse.json(
      { error: "Failed to create location" },
      { status: 500 }
    );
  }
}

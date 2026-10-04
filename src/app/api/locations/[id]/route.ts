import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { updateLocation, deleteLocation, setHomeLocation } from "@/lib/db/queries";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.latitude !== undefined)
      data.latitude = body.latitude.toString();
    if (body.longitude !== undefined)
      data.longitude = body.longitude.toString();

    if (body.isHome !== undefined && typeof body.isHome !== "boolean") {
      return NextResponse.json({ error: "isHome must be a boolean" }, { status: 400 });
    }

    let updated = Object.keys(data).length > 0 ? await updateLocation(id, userId, data) : undefined;
    if (typeof body.isHome === "boolean") {
      updated = await setHomeLocation(id, userId, body.isHome);
    }

    if (!updated) {
      return NextResponse.json(
        { error: "Location not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ location: updated });
  } catch (error) {
    console.error("[API] PATCH /api/locations/:id error:", error);
    return NextResponse.json(
      { error: "Failed to update location" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const deleted = await deleteLocation(id, userId);

    if (!deleted) {
      return NextResponse.json(
        { error: "Location not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API] DELETE /api/locations/:id error:", error);
    return NextResponse.json(
      { error: "Failed to delete location" },
      { status: 500 }
    );
  }
}

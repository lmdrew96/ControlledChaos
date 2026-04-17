import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { softDeleteMoment, updateMoment } from "@/lib/db/queries";

function parseIntensity(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("intensity must be a number between 1 and 5");
  }
  const rounded = Math.round(value);
  if (rounded < 1 || rounded > 5) {
    throw new Error("intensity must be between 1 and 5");
  }
  return rounded;
}

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

    let intensity: number | null | undefined;
    try {
      intensity = parseIntensity(body.intensity);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Invalid intensity" },
        { status: 400 }
      );
    }

    let note: string | null | undefined;
    if (body.note === undefined) {
      note = undefined;
    } else if (body.note === null) {
      note = null;
    } else if (typeof body.note === "string") {
      note = body.note.slice(0, 500);
    } else {
      return NextResponse.json(
        { error: "note must be a string or null" },
        { status: 400 }
      );
    }

    let occurredAt: Date | undefined;
    if (body.occurredAt !== undefined && body.occurredAt !== null) {
      if (typeof body.occurredAt !== "string") {
        return NextResponse.json(
          { error: "occurredAt must be an ISO 8601 string" },
          { status: 400 }
        );
      }
      const parsed = new Date(body.occurredAt);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json(
          { error: "occurredAt is not a valid date" },
          { status: 400 }
        );
      }
      occurredAt = parsed;
    }

    const updated = await updateMoment(id, userId, {
      intensity,
      note,
      occurredAt,
    });

    if (!updated) {
      return NextResponse.json({ error: "Moment not found" }, { status: 404 });
    }

    return NextResponse.json({ moment: updated });
  } catch (error) {
    console.error("[API] PATCH /api/moments/:id error:", error);
    return NextResponse.json(
      { error: "Failed to update moment" },
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
    const deleted = await softDeleteMoment(id, userId);

    if (!deleted) {
      return NextResponse.json({ error: "Moment not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API] DELETE /api/moments/:id error:", error);
    return NextResponse.json(
      { error: "Failed to delete moment" },
      { status: 500 }
    );
  }
}

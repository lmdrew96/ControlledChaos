import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  insertMoment,
  isValidMomentType,
} from "@/lib/db/queries";

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

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { type, note, occurredAt } = body as {
      type?: unknown;
      note?: unknown;
      occurredAt?: unknown;
    };

    if (typeof type !== "string" || !isValidMomentType(type)) {
      return NextResponse.json(
        { error: "Invalid moment type" },
        { status: 400 }
      );
    }

    let intensity: number | null | undefined;
    try {
      intensity = parseIntensity(body.intensity);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Invalid intensity" },
        { status: 400 }
      );
    }

    let occurredAtDate: Date | undefined;
    if (occurredAt !== undefined && occurredAt !== null) {
      if (typeof occurredAt !== "string") {
        return NextResponse.json(
          { error: "occurredAt must be an ISO 8601 string" },
          { status: 400 }
        );
      }
      const parsed = new Date(occurredAt);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json(
          { error: "occurredAt is not a valid date" },
          { status: 400 }
        );
      }
      occurredAtDate = parsed;
    }

    const noteValue =
      note === undefined
        ? undefined
        : note === null
          ? null
          : typeof note === "string"
            ? note.slice(0, 500)
            : null;

    const moment = await insertMoment({
      userId,
      type,
      intensity: intensity ?? null,
      note: noteValue ?? null,
      occurredAt: occurredAtDate,
    });

    return NextResponse.json({ moment }, { status: 201 });
  } catch (error) {
    console.error("[API] POST /api/moments error:", error);
    return NextResponse.json(
      { error: "Failed to log moment" },
      { status: 500 }
    );
  }
}

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  insertMoment,
  listMoments,
  isValidMomentType,
} from "@/lib/db/queries";
import type { MomentType } from "@/types";

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

function parseTypes(raw: string | null): MomentType[] | undefined {
  if (!raw) return undefined;
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const result: MomentType[] = [];
  for (const p of parts) {
    if (isValidMomentType(p)) result.push(p);
  }
  return result.length > 0 ? result : undefined;
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

export async function GET(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const fromRaw = url.searchParams.get("from");
    const toRaw = url.searchParams.get("to");
    const typesRaw = url.searchParams.get("types");
    const limitRaw = url.searchParams.get("limit");

    const from = fromRaw ? new Date(fromRaw) : undefined;
    const to = toRaw ? new Date(toRaw) : undefined;
    if (from && Number.isNaN(from.getTime())) {
      return NextResponse.json({ error: "Invalid 'from'" }, { status: 400 });
    }
    if (to && Number.isNaN(to.getTime())) {
      return NextResponse.json({ error: "Invalid 'to'" }, { status: 400 });
    }

    const types = parseTypes(typesRaw);
    const limit = limitRaw ? Math.max(1, Math.min(500, parseInt(limitRaw, 10))) : undefined;

    const rows = await listMoments(userId, { from, to, types, limit });
    return NextResponse.json({ moments: rows });
  } catch (error) {
    console.error("[API] GET /api/moments error:", error);
    return NextResponse.json(
      { error: "Failed to list moments" },
      { status: 500 }
    );
  }
}

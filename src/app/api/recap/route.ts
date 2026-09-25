import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getRecapDay, getUser } from "@/lib/db/queries";
import { allDayRange } from "@/lib/timezone";
import type { RecapKind } from "@/types";

const VALID_KINDS: RecapKind[] = [
  "task",
  "microtask",
  "event",
  "dump",
  "journal",
  "moment",
  "rescue",
];

function parseKinds(raw: string | null): RecapKind[] | undefined {
  if (!raw) return undefined;
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const out: RecapKind[] = [];
  for (const p of parts) {
    if ((VALID_KINDS as string[]).includes(p)) out.push(p as RecapKind);
  }
  return out.length > 0 ? out : undefined;
}

/**
 * Convert a user-facing YYYY-MM-DD into that day's [start, end) window in the
 * user's timezone — local midnight to the next local midnight, so a 23- or
 * 25-hour DST day is covered exactly.
 */
function dayWindow(dateStr: string, timezone: string): { start: Date; end: Date } {
  const { startISO, endISO } = allDayRange(dateStr, timezone);
  return { start: new Date(startISO), end: new Date(endISO) };
}

export async function GET(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const dateRaw = url.searchParams.get("date");
    const typesRaw = url.searchParams.get("types");

    if (!dateRaw || !/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) {
      return NextResponse.json(
        { error: "Missing or invalid 'date' (expected YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    const user = await getUser(userId);
    const timezone = user?.timezone ?? "America/New_York";

    const { start, end } = dayWindow(dateRaw, timezone);
    const kinds = parseKinds(typesRaw);

    const entries = await getRecapDay(userId, start, end, kinds);

    return NextResponse.json({
      date: dateRaw,
      timezone,
      entries,
    });
  } catch (error) {
    console.error("[API] GET /api/recap error:", error);
    return NextResponse.json(
      { error: "Failed to load recap day" },
      { status: 500 }
    );
  }
}

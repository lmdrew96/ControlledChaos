import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import {
  createMicrotask,
  getMicrotasksForDashboard,
  listAllMicrotasksForUser,
  type MicrotaskTimeOfDay,
} from "@/lib/db/queries";
import { todayInTimezone } from "@/lib/timezone";

const VALID_TIME_OF_DAY: ReadonlySet<MicrotaskTimeOfDay> = new Set([
  "morning",
  "afternoon",
  "evening",
  "anytime",
]);

function isValidTimeOfDay(v: unknown): v is MicrotaskTimeOfDay {
  return typeof v === "string" && VALID_TIME_OF_DAY.has(v as MicrotaskTimeOfDay);
}

function isValidDaysOfWeek(v: unknown): v is number[] {
  return (
    Array.isArray(v) &&
    v.length > 0 &&
    v.length <= 7 &&
    v.every((n) => Number.isInteger(n) && n >= 0 && n <= 6) &&
    new Set(v).size === v.length
  );
}

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ?all=true → manage view: every microtask the user owns, no enrichment.
    if (request.nextUrl.searchParams.get("all") === "true") {
      const microtasks = await listAllMicrotasksForUser(userId);
      return NextResponse.json({ microtasks });
    }

    const [user] = await db
      .select({ timezone: users.timezone })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const tz = user?.timezone ?? "America/New_York";

    const today = todayInTimezone(tz);
    // 0 = Sunday … 6 = Saturday — matches our days_of_week storage
    const dayOfWeek = new Date(today + "T12:00:00Z").getUTCDay();

    const microtasks = await getMicrotasksForDashboard(userId, today, dayOfWeek);
    return NextResponse.json({ microtasks, today, dayOfWeek });
  } catch (error) {
    console.error("[API] GET /api/microtasks error:", error);
    return NextResponse.json(
      { error: "Failed to fetch microtasks" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { title, emoji, time_of_day, days_of_week } = body ?? {};

    if (typeof title !== "string" || !title.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }
    if (time_of_day !== undefined && !isValidTimeOfDay(time_of_day)) {
      return NextResponse.json(
        { error: "Invalid time_of_day (morning|afternoon|evening|anytime)" },
        { status: 400 }
      );
    }
    if (days_of_week !== undefined && !isValidDaysOfWeek(days_of_week)) {
      return NextResponse.json(
        { error: "Invalid days_of_week (array of unique 0..6)" },
        { status: 400 }
      );
    }

    const microtask = await createMicrotask(userId, {
      title: title.trim(),
      emoji: typeof emoji === "string" && emoji.trim() ? emoji.trim() : null,
      timeOfDay: time_of_day,
      daysOfWeek: days_of_week,
    });

    return NextResponse.json({ microtask }, { status: 201 });
  } catch (error) {
    console.error("[API] POST /api/microtasks error:", error);
    return NextResponse.json(
      { error: "Failed to create microtask" },
      { status: 500 }
    );
  }
}

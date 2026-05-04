import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { calendarEvents } from "@/lib/db/schema";
import { getUser } from "@/lib/db/queries";
import { toUserLocal } from "@/lib/timezone";

export async function GET(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const externalId = url.searchParams.get("externalId");
    if (!externalId) {
      return NextResponse.json(
        { error: "Missing externalId" },
        { status: 400 }
      );
    }

    const [event] = await db
      .select({
        id: calendarEvents.id,
        title: calendarEvents.title,
        startTime: calendarEvents.startTime,
      })
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.userId, userId),
          eq(calendarEvents.externalId, externalId)
        )
      )
      .limit(1);

    if (!event) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const user = await getUser(userId);
    const timezone = user?.timezone ?? "America/New_York";
    const local = toUserLocal(event.startTime, timezone);
    const pad = (n: number) => String(n).padStart(2, "0");
    const date = `${local.year}-${pad(local.month)}-${pad(local.day)}`;

    return NextResponse.json({
      id: event.id,
      title: event.title,
      date,
    });
  } catch (error) {
    console.error("[API] GET /api/calendar/events/by-external error:", error);
    return NextResponse.json(
      { error: "Failed to load event" },
      { status: 500 }
    );
  }
}

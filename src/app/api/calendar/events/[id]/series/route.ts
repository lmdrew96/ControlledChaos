import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import {
  deleteCalendarEvent,
  deleteCalendarEventsBySeries,
  updateCalendarEventSeries,
} from "@/lib/db/queries";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** PATCH /api/calendar/events/[id]/series — update title/description/location for all events in a series */
export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await req.json();

    const { db } = await import("@/lib/db");
    const { calendarEvents } = await import("@/lib/db/schema");
    const { eq, and } = await import("drizzle-orm");

    const [event] = await db
      .select()
      .from(calendarEvents)
      .where(and(eq(calendarEvents.id, id), eq(calendarEvents.userId, userId)))
      .limit(1);

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    if (!event.seriesId) {
      return NextResponse.json({ error: "Event is not part of a series" }, { status: 400 });
    }

    const data: { title?: string; description?: string | null; location?: string | null } = {};
    if (body.title !== undefined) data.title = body.title;
    if (body.description !== undefined) data.description = body.description;
    if (body.location !== undefined) data.location = body.location;

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const updated = await updateCalendarEventSeries(event.seriesId, userId, data);

    return NextResponse.json({ success: true, updated: updated.length });
  } catch (error) {
    console.error("[API] PATCH /api/calendar/events/[id]/series error:", error);
    return NextResponse.json(
      { error: "Failed to update event series" },
      { status: 500 }
    );
  }
}

/** DELETE /api/calendar/events/[id]/series — delete all events in a recurring series */
export async function DELETE(_req: NextRequest, context: RouteContext) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;

    // First, fetch the event to get its seriesId
    // We use deleteCalendarEvent then re-insert if it has a seriesId,
    // but simpler: just query for the event first
    const { db } = await import("@/lib/db");
    const { calendarEvents } = await import("@/lib/db/schema");
    const { eq, and } = await import("drizzle-orm");

    const [event] = await db
      .select()
      .from(calendarEvents)
      .where(and(eq(calendarEvents.id, id), eq(calendarEvents.userId, userId)))
      .limit(1);

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    if (!event.seriesId) {
      // Not a series — just delete the single event
      await deleteCalendarEvent(id, userId);
      return NextResponse.json({ success: true, deleted: 1 });
    }

    const deleted = await deleteCalendarEventsBySeries(
      event.seriesId,
      userId
    );

    return NextResponse.json({
      success: true,
      deleted: deleted.length,
    });
  } catch (error) {
    console.error("[API] DELETE /api/calendar/events/[id]/series error:", error);
    return NextResponse.json(
      { error: "Failed to delete event series" },
      { status: 500 }
    );
  }
}

import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import {
  deleteCalendarEvent,
  deleteCalendarEventsBySeries,
  updateCalendarEventSeries,
  updateCalendarEvent,
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

    const data: { title?: string; description?: string | null; location?: string | null; isAllDay?: boolean } = {};
    if (body.title !== undefined) data.title = body.title;
    if (body.description !== undefined) data.description = body.description;
    if (body.location !== undefined) data.location = body.location;
    if (body.isAllDay !== undefined) data.isAllDay = body.isAllDay;

    // Apply bulk fields (title, description, location, isAllDay)
    if (Object.keys(data).length > 0) {
      await updateCalendarEventSeries(event.seriesId, userId, data);
    }

    // Apply time-of-day change to every event in the series individually,
    // preserving each event's own date but replacing the HH:MM.
    if (body.startTime !== undefined || body.endTime !== undefined) {
      const { db } = await import("@/lib/db");
      const { calendarEvents } = await import("@/lib/db/schema");
      const { eq, and } = await import("drizzle-orm");

      const seriesEvents = await db
        .select()
        .from(calendarEvents)
        .where(
          and(
            eq(calendarEvents.seriesId, event.seriesId),
            eq(calendarEvents.userId, userId)
          )
        );

      const newStart = body.startTime ? new Date(body.startTime) : null;
      const newEnd = body.endTime ? new Date(body.endTime) : null;
      const durationMs =
        newStart && newEnd ? newEnd.getTime() - newStart.getTime() : null;

      for (const e of seriesEvents) {
        const updateData: { startTime?: Date; endTime?: Date } = {};

        if (newStart) {
          const existing = new Date(e.startTime);
          const updated = new Date(existing);
          updated.setHours(newStart.getHours(), newStart.getMinutes(), 0, 0);
          updateData.startTime = updated;

          if (durationMs !== null) {
            updateData.endTime = new Date(updated.getTime() + durationMs);
          }
        } else if (newEnd) {
          const existing = new Date(e.endTime);
          const updated = new Date(existing);
          updated.setHours(newEnd.getHours(), newEnd.getMinutes(), 0, 0);
          updateData.endTime = updated;
        }

        await updateCalendarEvent(e.id, userId, updateData);
      }
    }

    if (Object.keys(data).length === 0 && body.startTime === undefined && body.endTime === undefined) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
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

import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import {
  deleteCalendarEvent,
  deleteCalendarEventsBySeries,
} from "@/lib/db/queries";

interface RouteContext {
  params: Promise<{ id: string }>;
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

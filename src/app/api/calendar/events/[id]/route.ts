import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import {
  deleteCalendarEvent,
  getCalendarEventById,
  updateCalendarEvent,
  updateTask,
} from "@/lib/db/queries";

/** Long enough for "📝 Quiz today", short enough to fit on a narrow tile. */
const MAX_BADGE_LENGTH = 24;

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** DELETE /api/calendar/events/[id] — remove a CC scheduled event */
export async function DELETE(_req: NextRequest, context: RouteContext) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    // Check the source BEFORE writing. Checking the returned row afterwards
    // meant a Canvas event was already gone by the time we answered 403.
    const existing = await getCalendarEventById(id, userId);
    if (!existing) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    if (existing.source !== "controlledchaos") {
      return NextResponse.json(
        { error: "Only scheduled events can be deleted" },
        { status: 403 }
      );
    }

    const deleted = await deleteCalendarEvent(id, userId);
    if (!deleted) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Clear scheduledFor on the linked task (externalId format: cc-{taskId}-{startTime})
    if (deleted.externalId?.startsWith("cc-")) {
      const taskId = deleted.externalId.split("-").slice(1, 6).join("-"); // UUID is 5 parts
      await updateTask(taskId, userId, { scheduledFor: null }).catch((err) =>
        console.error("[API] Failed to clear task.scheduledFor:", err)
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API] DELETE /api/calendar/events/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to delete event" },
      { status: 500 }
    );
  }
}

/** PATCH /api/calendar/events/[id] — update a CC scheduled event */
export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await req.json();

    const data: Record<string, unknown> = {};
    if (body.title !== undefined) data.title = body.title;
    if (body.description !== undefined) data.description = body.description;
    if (body.location !== undefined) data.location = body.location;
    if (body.startTime !== undefined) data.startTime = new Date(body.startTime);
    if (body.endTime !== undefined) data.endTime = new Date(body.endTime);
    if (body.isAllDay !== undefined) data.isAllDay = body.isAllDay;
    if (body.badge !== undefined) {
      // A tile label, not a note: short, and empty means none.
      const badge = typeof body.badge === "string" ? body.badge.trim().slice(0, MAX_BADGE_LENGTH) : "";
      data.badge = badge.length > 0 ? badge : null;
    }
    if (body.category !== undefined) {
      const valid = new Set(["school", "work", "personal", "errands", "health"]);
      data.category = valid.has(body.category) ? body.category : null;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    // Source check before the write — see DELETE.
    const existing = await getCalendarEventById(id, userId);
    if (!existing) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    if (existing.source !== "controlledchaos") {
      return NextResponse.json(
        { error: "Only scheduled events can be edited" },
        { status: 403 }
      );
    }

    const updated = await updateCalendarEvent(id, userId, data);
    if (!updated) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    return NextResponse.json({ event: updated });
  } catch (error) {
    console.error("[API] PATCH /api/calendar/events/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to update event" },
      { status: 500 }
    );
  }
}

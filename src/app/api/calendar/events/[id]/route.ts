import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import {
  deleteCalendarEvent,
  updateCalendarEvent,
  updateTask,
} from "@/lib/db/queries";

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
    const deleted = await deleteCalendarEvent(id, userId);

    if (!deleted) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    if (deleted.source !== "controlledchaos") {
      return NextResponse.json(
        { error: "Only scheduled events can be deleted" },
        { status: 403 }
      );
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

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    const updated = await updateCalendarEvent(id, userId, data);

    if (!updated) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    if (updated.source !== "controlledchaos") {
      return NextResponse.json(
        { error: "Only scheduled events can be edited" },
        { status: 403 }
      );
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

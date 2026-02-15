import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import {
  deleteCalendarEvent,
  updateCalendarEvent,
  getUserSettings,
} from "@/lib/db/queries";
import { getGoogleAccessToken } from "@/lib/calendar/google-auth";
import { createGoogleCalendarClient } from "@/lib/calendar/google";

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

    // Only CC events can be deleted by the user
    if (deleted.source !== "controlledchaos") {
      return NextResponse.json(
        { error: "Only scheduled events can be deleted" },
        { status: 403 }
      );
    }

    // Also delete from Google Calendar if it was synced there
    if (deleted.externalId && !deleted.externalId.startsWith("cc-")) {
      try {
        const token = await getGoogleAccessToken(userId);
        if (token) {
          const gcal = createGoogleCalendarClient(token);
          await gcal.deleteEvent(deleted.externalId);
        }
      } catch {
        // Non-critical — local delete already succeeded
      }
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
    if (body.startTime !== undefined) data.startTime = new Date(body.startTime);
    if (body.endTime !== undefined) data.endTime = new Date(body.endTime);

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

    // Sync changes to Google Calendar if connected
    if (updated.externalId && !updated.externalId.startsWith("cc-")) {
      try {
        const settings = await getUserSettings(userId);
        if (settings?.googleCalConnected) {
          const token = await getGoogleAccessToken(userId);
          if (token) {
            const gcal = createGoogleCalendarClient(token);
            const timezone =
              Intl.DateTimeFormat().resolvedOptions().timeZone ||
              "America/New_York";
            await gcal.patchEvent(updated.externalId, {
              summary: updated.title,
              ...(body.startTime && {
                start: {
                  dateTime: updated.startTime.toISOString(),
                  timeZone: timezone,
                },
              }),
              ...(body.endTime && {
                end: {
                  dateTime: updated.endTime.toISOString(),
                  timeZone: timezone,
                },
              }),
            });
          }
        }
      } catch {
        // Non-critical — local update already succeeded
      }
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

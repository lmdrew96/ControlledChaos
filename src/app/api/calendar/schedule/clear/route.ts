import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { deleteStaleCalendarEvents } from "@/lib/db/queries";

/** DELETE /api/calendar/schedule/clear — remove all AI-scheduled events */
export async function DELETE() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Passing an empty array deletes ALL events for the given source
    const deleted = await deleteStaleCalendarEvents(
      userId,
      "controlledchaos",
      []
    );

    return NextResponse.json({
      success: true,
      deleted: deleted.length,
    });
  } catch (error) {
    console.error("[API] DELETE /api/calendar/schedule/clear error:", error);
    return NextResponse.json(
      { error: "Failed to clear scheduled events" },
      { status: 500 }
    );
  }
}

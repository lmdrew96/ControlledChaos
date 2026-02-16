import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { calendarEvents } from "@/lib/db/schema";
import { eq, and, like } from "drizzle-orm";

/** DELETE /api/calendar/schedule/clear — remove only AI-scheduled events (cc- prefix) */
export async function DELETE() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only delete events with "cc-" externalId prefix (AI scheduler)
    // Preserve manual- and dump- events created by users/brain dumps
    const deleted = await db
      .delete(calendarEvents)
      .where(
        and(
          eq(calendarEvents.userId, userId),
          eq(calendarEvents.source, "controlledchaos"),
          like(calendarEvents.externalId, "cc-%")
        )
      )
      .returning();

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

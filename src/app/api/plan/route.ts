import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  getUser,
  getScheduledTasksInRange,
  clearScheduledInRange,
} from "@/lib/db/queries";
import { startOfDayInTimezone } from "@/lib/timezone";
import { planBlockEnd, planBlockMinutes } from "@/lib/calendar/plan-blocks";

async function todayBounds(userId: string) {
  const user = await getUser(userId);
  const timezone = user?.timezone ?? "America/New_York";
  const start = startOfDayInTimezone(new Date(), timezone);
  const end = new Date(start.getTime() + 24 * 3_600_000);
  return { timezone, start, end };
}

/** GET /api/plan — today's committed plan blocks. */
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { start, end } = await todayBounds(userId);
    const scheduled = await getScheduledTasksInRange(userId, start, end);

    return NextResponse.json({
      blocks: scheduled.map((t) => ({
        taskId: t.id,
        taskTitle: t.title,
        startTime: (t.scheduledFor as Date).toISOString(),
        endTime: planBlockEnd(t.scheduledFor as Date, t.estimatedMinutes).toISOString(),
        minutes: planBlockMinutes(t.estimatedMinutes),
        status: t.status,
      })),
    });
  } catch (error) {
    console.error("[API] GET /api/plan error:", error);
    return NextResponse.json({ error: "Failed to load plan" }, { status: 500 });
  }
}

/**
 * DELETE /api/plan — clear today's plan.
 *
 * One update nulling `scheduledFor`. This is the whole undo story now: when
 * plans were calendar events, clearing them meant hunting down and deleting
 * rows that had already drifted from their tasks.
 */
export async function DELETE() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { start, end } = await todayBounds(userId);
    const cleared = await clearScheduledInRange(userId, start, end);

    return NextResponse.json({ cleared });
  } catch (error) {
    console.error("[API] DELETE /api/plan error:", error);
    return NextResponse.json({ error: "Failed to clear plan" }, { status: 500 });
  }
}

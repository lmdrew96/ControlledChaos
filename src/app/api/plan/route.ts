import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  getUser,
  clearSessionsInRange,
} from "@/lib/db/queries";
import { localDaysRange } from "@/lib/timezone";

async function todayBounds(userId: string) {
  const user = await getUser(userId);
  const timezone = user?.timezone ?? "America/New_York";
  const { start, end } = localDaysRange(new Date(), timezone);
  return { timezone, start, end };
}
/**
 * DELETE /api/plan — clear what's still ahead in today's plan.
 *
 * Removes today's unanswered sittings from now on (see clearSessionsInRange).
 * This is the whole undo story now: when plans were calendar events, clearing
 * them meant hunting down and deleting rows that had already drifted from
 * their tasks.
 */
export async function DELETE() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { start, end } = await todayBounds(userId);
    const cleared = await clearSessionsInRange(userId, start, end);

    return NextResponse.json({ cleared });
  } catch (error) {
    console.error("[API] DELETE /api/plan error:", error);
    return NextResponse.json({ error: "Failed to clear plan" }, { status: 500 });
  }
}

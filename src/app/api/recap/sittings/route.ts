import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getScheduledSessionsInRange, getUser } from "@/lib/db/queries";
import { allDayRange, todayInTimezone } from "@/lib/timezone";
import { planBlockEnd } from "@/lib/calendar/plan-blocks";

/**
 * GET /api/recap/sittings?date=YYYY-MM-DD
 *
 * Sittings from that day that have ended and have no outcome yet, for the
 * Daily Recap's "how did these go?" sweep. Unanswered is fine: this only
 * lists them, and nothing reminds the user about them anywhere else.
 */
export async function GET(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await getUser(userId);
    const timezone = user?.timezone ?? "America/New_York";
    const raw = new URL(request.url).searchParams.get("date");
    const date = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : todayInTimezone(timezone);
    const { startISO, endISO } = allDayRange(date, timezone);

    const now = Date.now();
    const rows = await getScheduledSessionsInRange(userId, new Date(startISO), new Date(endISO));
    const sittings = rows
      .filter(
        (r) =>
          // A plan with no session row behind it has nowhere to store an outcome.
          !r.sessionId.startsWith("legacy-") &&
          r.sessionStatus == null &&
          planBlockEnd(r.scheduledFor, r.sessionMinutes ?? r.estimatedMinutes).getTime() <= now
      )
      .map((r) => ({
        sessionId: r.sessionId,
        taskId: r.id,
        title: r.title,
        startsAt: r.scheduledFor.toISOString(),
        minutes: r.sessionMinutes ?? r.estimatedMinutes,
      }));

    return NextResponse.json({ sittings });
  } catch (error) {
    console.error("[API] GET /api/recap/sittings error:", error);
    return NextResponse.json({ error: "Failed to load sessions" }, { status: 500 });
  }
}

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { setSessionOutcome } from "@/lib/db/queries";
import type { SessionOutcome } from "@/lib/calendar/session-minutes";

const OUTCOMES: SessionOutcome[] = ["done", "partial", "skipped"];

/**
 * POST — log how a sitting went: { status: "done" | "partial" | "skipped" | null,
 * minutes?: number }. `minutes` is required for partial; null clears the log.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sessionId } = await params;
    const body = await request.json().catch(() => null);
    const status = body?.status ?? null;
    if (status !== null && !OUTCOMES.includes(status)) {
      return NextResponse.json(
        { error: "status must be done, partial, skipped or null" },
        { status: 400 }
      );
    }
    if (status === "partial" && !(typeof body?.minutes === "number" && body.minutes > 0)) {
      return NextResponse.json(
        { error: "minutes is required for a partial session" },
        { status: 400 }
      );
    }

    const result = await setSessionOutcome(
      sessionId,
      userId,
      status,
      typeof body?.minutes === "number" ? body.minutes : undefined
    );
    if (!result) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({ outcome: result });
  } catch (error) {
    console.error("[API] POST /api/tasks/:id/sessions/:sessionId/outcome error:", error);
    return NextResponse.json({ error: "Failed to log session" }, { status: 500 });
  }
}

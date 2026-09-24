import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getTaskSessions, addTaskSession } from "@/lib/db/queries";

/**
 * Work sessions for one task.
 *
 * A task can be planned across several sittings, which a single
 * `scheduledFor` timestamp cannot express. PATCH /api/tasks/[id] still accepts
 * `scheduledFor` and REPLACES the plan with one block; this route is how a
 * second, third, ... sitting gets added.
 */

/** GET — every planned sitting for this task, soonest first. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const sessions = await getTaskSessions(id, userId);

    return NextResponse.json({
      sessions: sessions.map((s) => ({
        id: s.id,
        startsAt: s.startsAt.toISOString(),
        minutes: s.minutes,
        resolvedMinutes: s.resolvedMinutes,
      })),
    });
  } catch (error) {
    console.error("[API] GET /api/tasks/:id/sessions error:", error);
    return NextResponse.json(
      { error: "Failed to load sessions" },
      { status: 500 }
    );
  }
}

/** POST — add a sitting, leaving existing ones in place. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    if (typeof body?.startsAt !== "string") {
      return NextResponse.json(
        { error: "startsAt is required" },
        { status: 400 }
      );
    }

    const startsAt = new Date(body.startsAt);
    if (isNaN(startsAt.getTime())) {
      return NextResponse.json(
        { error: "startsAt must be a valid date" },
        { status: 400 }
      );
    }

    // Null keeps the sitting tracking the task's estimate, which is what a
    // single-block plan has always done.
    const minutes =
      typeof body.minutes === "number" && body.minutes > 0
        ? Math.round(body.minutes)
        : null;

    const session = await addTaskSession(id, userId, startsAt, minutes);
    if (!session) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json({
      session: {
        id: session.id,
        startsAt: session.startsAt.toISOString(),
        minutes: session.minutes,
      },
    });
  } catch (error) {
    console.error("[API] POST /api/tasks/:id/sessions error:", error);
    return NextResponse.json(
      { error: "Failed to add session" },
      { status: 500 }
    );
  }
}

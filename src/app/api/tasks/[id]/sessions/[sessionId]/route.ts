import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { moveTaskSession, deleteTaskSession } from "@/lib/db/queries";

/** PATCH — move one sitting. This is what a calendar drag writes. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sessionId } = await params;
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

    const minutes =
      body.minutes === null
        ? null
        : typeof body.minutes === "number" && body.minutes > 0
          ? Math.round(body.minutes)
          : undefined;

    const session = await moveTaskSession(sessionId, userId, startsAt, minutes);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({
      session: {
        id: session.id,
        startsAt: session.startsAt.toISOString(),
        minutes: session.minutes,
      },
    });
  } catch (error) {
    console.error("[API] PATCH /api/tasks/:id/sessions/:sessionId error:", error);
    return NextResponse.json(
      { error: "Failed to move session" },
      { status: 500 }
    );
  }
}

/** DELETE — drop one sitting. The task keeps the rest of its plan. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sessionId } = await params;
    const removed = await deleteTaskSession(sessionId, userId);

    if (!removed) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API] DELETE /api/tasks/:id/sessions/:sessionId error:", error);
    return NextResponse.json(
      { error: "Failed to remove session" },
      { status: 500 }
    );
  }
}

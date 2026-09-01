import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { commitPlanBlock } from "@/lib/db/queries";

interface IncomingBlock {
  taskId?: unknown;
  startTime?: unknown;
  minutes?: unknown;
}

/**
 * POST /api/plan/commit
 *
 * Writes the blocks the user accepted. A plan block is `scheduledFor` on the
 * task itself — never a calendar event. That keeps one source of truth, so a
 * completed or deleted task takes its block off the calendar automatically,
 * and it keeps an intention visually distinct from a commitment.
 */
export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const incoming: IncomingBlock[] = Array.isArray(body?.blocks) ? body.blocks : [];

    if (incoming.length === 0) {
      return NextResponse.json(
        { error: "No blocks to commit" },
        { status: 400 }
      );
    }

    if (incoming.length > 20) {
      return NextResponse.json(
        { error: "Too many blocks in one commit" },
        { status: 400 }
      );
    }

    const committed: Array<{ taskId: string; scheduledFor: string }> = [];
    const skipped: string[] = [];

    for (const block of incoming) {
      if (typeof block.taskId !== "string" || typeof block.startTime !== "string") {
        continue;
      }

      const scheduledFor = new Date(block.startTime);
      if (isNaN(scheduledFor.getTime())) {
        skipped.push(block.taskId);
        continue;
      }

      const minutes =
        typeof block.minutes === "number" && block.minutes > 0
          ? Math.round(block.minutes)
          : null;

      const updated = await commitPlanBlock(
        block.taskId,
        userId,
        scheduledFor,
        minutes
      );

      if (updated) {
        committed.push({
          taskId: updated.id,
          scheduledFor: scheduledFor.toISOString(),
        });
      } else {
        skipped.push(block.taskId);
      }
    }

    return NextResponse.json({
      committed: committed.length,
      blocks: committed,
      skipped,
    });
  } catch (error) {
    console.error("[API] POST /api/plan/commit error:", error);
    return NextResponse.json(
      { error: "Failed to save your plan" },
      { status: 500 }
    );
  }
}

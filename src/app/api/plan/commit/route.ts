import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  commitPlanBlock,
  getCalendarEventsByDateRange,
  getScheduledTasksInRange,
} from "@/lib/db/queries";
import {
  eventsAsBusyIntervals,
  findConflict,
  planBlockEnd,
  planBlocksAsBusy,
  type BusyInterval,
} from "@/lib/calendar/plan-blocks";

interface IncomingBlock {
  taskId?: unknown;
  startTime?: unknown;
  minutes?: unknown;
}

/** A normalized incoming block; `start` is null when the timestamp was unparseable. */
interface ParsedBlock {
  taskId: string;
  start: Date | null;
  minutes: number | null;
}

interface RejectedBlock {
  taskId: string;
  reason: "invalid" | "not_found" | "conflict";
  /** What the block collided with, when it collided with something. */
  conflictsWith?: string;
}

/**
 * POST /api/plan/commit
 *
 * Writes the blocks the user accepted. A plan block is `scheduledFor` on the
 * task itself — never a calendar event. That keeps one source of truth, so a
 * completed or deleted task takes its block off the calendar automatically,
 * and it keeps an intention visually distinct from a commitment.
 *
 * Commit — not propose — is where double-booking is actually prevented. The
 * model is not a scheduler, and the proposal it produced can be minutes stale
 * by the time the user accepts it: another device may have committed a block,
 * or the single-task "find me a time" button may have claimed the slot. So
 * every incoming block is re-checked here against live state, and against the
 * blocks accepted earlier in this same request.
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

    // Normalize first so the conflict window can be derived from real values.
    const parsed = incoming.flatMap<ParsedBlock>((block) => {
      if (typeof block.taskId !== "string" || typeof block.startTime !== "string") {
        return [];
      }
      const start = new Date(block.startTime);
      if (isNaN(start.getTime())) {
          return [{ taskId: block.taskId, start: null, minutes: null }];
      }
      const minutes =
        typeof block.minutes === "number" && block.minutes > 0
          ? Math.round(block.minutes)
          : null;
      return [{ taskId: block.taskId, start, minutes }];
    });

    const starts = parsed.flatMap((p) => (p.start ? [p.start.getTime()] : []));

    // Load whatever already occupies the span these blocks cover. Padded by a
    // day on each side so a long block near the edge still sees its neighbours.
    let busy: BusyInterval[] = [];
    if (starts.length > 0) {
      const from = new Date(Math.min(...starts) - 24 * 60 * 60 * 1000);
      const to = new Date(Math.max(...starts) + 24 * 60 * 60 * 1000);

      const [events, scheduled] = await Promise.all([
        getCalendarEventsByDateRange(userId, from, to),
        getScheduledTasksInRange(userId, from, to),
      ]);

      busy = [
        ...eventsAsBusyIntervals(events),
        ...planBlocksAsBusy(
          scheduled.map((t) => ({
            id: t.id,
            title: t.title,
            scheduledFor: t.scheduledFor?.toISOString() ?? null,
            estimatedMinutes: t.estimatedMinutes,
          }))
        ),
      ];
    }

    const committed: Array<{ taskId: string; scheduledFor: string }> = [];
    const rejected: RejectedBlock[] = [];

    for (const block of parsed) {
      if (!block.start) {
        rejected.push({ taskId: block.taskId, reason: "invalid" });
        continue;
      }

      const startMs = block.start.getTime();
      const endMs = planBlockEnd(block.start, block.minutes).getTime();

      // A task re-committing its own slot is a move, not a collision.
      const conflict = findConflict(startMs, endMs, busy, {
        ignoreTaskId: block.taskId,
      });

      if (conflict) {
        rejected.push({
          taskId: block.taskId,
          reason: "conflict",
          conflictsWith: conflict.label,
        });
        continue;
      }

      const updated = await commitPlanBlock(
        block.taskId,
        userId,
        block.start,
        block.minutes
      );

      if (!updated) {
        rejected.push({ taskId: block.taskId, reason: "not_found" });
        continue;
      }

      committed.push({
        taskId: updated.id,
        scheduledFor: block.start.toISOString(),
      });

      // Claim the slot so a later block in this same request can't take it too.
      busy.push({
        startMs,
        endMs: planBlockEnd(
          block.start,
          updated.estimatedMinutes ?? block.minutes
        ).getTime(),
        label: updated.title,
        taskId: updated.id,
      });
    }

    return NextResponse.json({
      committed: committed.length,
      blocks: committed,
      rejected,
      // Kept for older clients that read `skipped` as a flat list of task ids.
      skipped: rejected.map((r) => r.taskId),
    });
  } catch (error) {
    console.error("[API] POST /api/plan/commit error:", error);
    return NextResponse.json(
      { error: "Failed to save your plan" },
      { status: 500 }
    );
  }
}

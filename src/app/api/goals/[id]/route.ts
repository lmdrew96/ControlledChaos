import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { updateGoal, deleteGoal } from "@/lib/db/queries";

const GOAL_STATUSES = new Set(["active", "completed", "paused"]);

type GoalUpdate = Parameters<typeof updateGoal>[2];

/**
 * Copy only the fields a client may change. Spreading the raw body into
 * .set() would let a request rewrite userId, deletedAt, id or createdAt.
 */
function parseGoalUpdate(body: unknown): { fields: GoalUpdate } | { error: string } {
  if (!body || typeof body !== "object") return { error: "Invalid body" };
  const b = body as Record<string, unknown>;
  const fields: GoalUpdate = {};

  if (b.title !== undefined) {
    if (typeof b.title !== "string" || !b.title.trim()) return { error: "Title is required" };
    fields.title = b.title.trim();
  }
  if (b.description !== undefined) {
    if (b.description !== null && typeof b.description !== "string") return { error: "Invalid description" };
    fields.description = b.description || null;
  }
  if (b.targetDate !== undefined) {
    if (!b.targetDate) {
      fields.targetDate = null;
    } else {
      const d = typeof b.targetDate === "string" ? new Date(b.targetDate) : null;
      if (!d || Number.isNaN(d.getTime())) return { error: "Invalid targetDate" };
      fields.targetDate = d;
    }
  }
  if (b.status !== undefined) {
    if (typeof b.status !== "string" || !GOAL_STATUSES.has(b.status)) return { error: "Invalid status" };
    fields.status = b.status;
  }

  if (Object.keys(fields).length === 0) return { error: "No updatable fields" };
  return { fields };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const parsed = parseGoalUpdate(await request.json());
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const updated = await updateGoal(id, userId, parsed.fields);

    if (!updated) {
      return NextResponse.json({ error: "Goal not found" }, { status: 404 });
    }

    return NextResponse.json({ goal: updated });
  } catch (error) {
    console.error("[API] PATCH /api/goals/:id error:", error);
    return NextResponse.json(
      { error: "Failed to update goal" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const deleted = await deleteGoal(id, userId);

    if (!deleted) {
      return NextResponse.json({ error: "Goal not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API] DELETE /api/goals/:id error:", error);
    return NextResponse.json(
      { error: "Failed to delete goal" },
      { status: 500 }
    );
  }
}

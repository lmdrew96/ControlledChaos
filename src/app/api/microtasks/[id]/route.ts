import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  deactivateMicrotask,
  updateMicrotask,
  type MicrotaskTimeOfDay,
  type UpdateMicrotaskInput,
} from "@/lib/db/queries";

const VALID_TIME_OF_DAY: ReadonlySet<MicrotaskTimeOfDay> = new Set([
  "morning",
  "afternoon",
  "evening",
  "anytime",
]);

function isValidTimeOfDay(v: unknown): v is MicrotaskTimeOfDay {
  return typeof v === "string" && VALID_TIME_OF_DAY.has(v as MicrotaskTimeOfDay);
}

function isValidDaysOfWeek(v: unknown): v is number[] {
  return (
    Array.isArray(v) &&
    v.length > 0 &&
    v.length <= 7 &&
    v.every((n) => Number.isInteger(n) && n >= 0 && n <= 6) &&
    new Set(v).size === v.length
  );
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
    const body = await request.json();
    const patch: UpdateMicrotaskInput = {};

    if (body.title !== undefined) {
      if (typeof body.title !== "string" || !body.title.trim()) {
        return NextResponse.json({ error: "Title cannot be empty" }, { status: 400 });
      }
      patch.title = body.title.trim();
    }
    if (body.emoji !== undefined) {
      patch.emoji =
        typeof body.emoji === "string" && body.emoji.trim() ? body.emoji.trim() : null;
    }
    if (body.time_of_day !== undefined) {
      if (!isValidTimeOfDay(body.time_of_day)) {
        return NextResponse.json({ error: "Invalid time_of_day" }, { status: 400 });
      }
      patch.timeOfDay = body.time_of_day;
    }
    if (body.days_of_week !== undefined) {
      if (!isValidDaysOfWeek(body.days_of_week)) {
        return NextResponse.json({ error: "Invalid days_of_week" }, { status: 400 });
      }
      patch.daysOfWeek = body.days_of_week;
    }
    if (body.active !== undefined) {
      if (typeof body.active !== "boolean") {
        return NextResponse.json({ error: "Invalid active flag" }, { status: 400 });
      }
      patch.active = body.active;
    }
    if (body.sort_order !== undefined) {
      if (!Number.isInteger(body.sort_order)) {
        return NextResponse.json({ error: "Invalid sort_order" }, { status: 400 });
      }
      patch.sortOrder = body.sort_order;
    }

    const updated = await updateMicrotask(id, userId, patch);
    if (!updated) {
      return NextResponse.json({ error: "Microtask not found" }, { status: 404 });
    }
    return NextResponse.json({ microtask: updated });
  } catch (error) {
    console.error("[API] PATCH /api/microtasks/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to update microtask" },
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
    const updated = await deactivateMicrotask(id, userId);
    if (!updated) {
      return NextResponse.json({ error: "Microtask not found" }, { status: 404 });
    }
    return NextResponse.json({ microtask: updated });
  } catch (error) {
    console.error("[API] DELETE /api/microtasks/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to deactivate microtask" },
      { status: 500 }
    );
  }
}

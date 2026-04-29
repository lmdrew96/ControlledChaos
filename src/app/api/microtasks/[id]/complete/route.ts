import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { completeMicrotask, uncompleteMicrotask } from "@/lib/db/queries";
import { todayInTimezone } from "@/lib/timezone";

async function getUserToday(userId: string): Promise<string> {
  const [user] = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return todayInTimezone(user?.timezone ?? "America/New_York");
}

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
    const today = await getUserToday(userId);

    let note: string | null = null;
    try {
      const body = await request.json();
      if (body && typeof body.note === "string" && body.note.trim()) {
        note = body.note.trim();
      }
    } catch {
      // body is optional — ignore JSON parse errors
    }

    const completion = await completeMicrotask(id, userId, today, note);
    if (!completion) {
      return NextResponse.json({ error: "Microtask not found" }, { status: 404 });
    }
    return NextResponse.json({ completion }, { status: 201 });
  } catch (error) {
    console.error("[API] POST /api/microtasks/[id]/complete error:", error);
    return NextResponse.json(
      { error: "Failed to complete microtask" },
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
    const today = await getUserToday(userId);

    const removed = await uncompleteMicrotask(id, userId, today);
    if (!removed) {
      return NextResponse.json(
        { error: "No completion to undo" },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API] DELETE /api/microtasks/[id]/complete error:", error);
    return NextResponse.json(
      { error: "Failed to uncomplete microtask" },
      { status: 500 }
    );
  }
}

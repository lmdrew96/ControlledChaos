import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { reorderGoals } from "@/lib/db/queries";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const orderedIds: unknown = body?.orderedIds;
    if (
      !Array.isArray(orderedIds) ||
      orderedIds.length === 0 ||
      orderedIds.length > 500 ||
      !orderedIds.every((id) => typeof id === "string" && UUID.test(id))
    ) {
      return NextResponse.json({ error: "orderedIds must be a list of goal ids" }, { status: 400 });
    }

    await reorderGoals(userId, orderedIds as string[]);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API] POST /api/goals/reorder error:", error);
    return NextResponse.json({ error: "Failed to reorder goals" }, { status: 500 });
  }
}

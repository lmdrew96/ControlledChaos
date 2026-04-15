import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { reorderTasks } from "@/lib/db/queries";

/**
 * POST /api/tasks/reorder
 * Bulk update task sortOrder.
 * Body: { orderedIds: string[] }
 */
export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { orderedIds } = body as { orderedIds?: string[] };

    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return NextResponse.json({ error: "orderedIds array is required" }, { status: 400 });
    }

    await reorderTasks(userId, orderedIds);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API] POST /api/tasks/reorder error:", error);
    return NextResponse.json({ error: "Failed to reorder tasks" }, { status: 500 });
  }
}

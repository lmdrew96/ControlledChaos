import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { revokeRoomMember } from "@/lib/db/queries";

interface RouteParams {
  params: Promise<{ id: string; userId: string }>;
}

/**
 * DELETE /api/rooms/[id]/members/[userId]
 * Owner-only: revoke a member's access. Drizzle-only; the corresponding
 * Convex presence row is cleared by the kicked user's own client when their
 * subscription returns no membership (or by the next idle-presence sweep).
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { userId: actorId } = await auth();
    if (!actorId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, userId: targetUserId } = await params;
    const ok = await revokeRoomMember(id, actorId, targetUserId);
    if (!ok) {
      return NextResponse.json(
        { error: "Forbidden or member not found" },
        { status: 403 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API] DELETE /api/rooms/[id]/members/[userId] error:", error);
    return NextResponse.json(
      { error: "Failed to revoke member" },
      { status: 500 }
    );
  }
}

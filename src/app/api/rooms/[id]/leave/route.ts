import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { leaveRoom } from "@/lib/db/queries";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * DELETE /api/rooms/[id]/leave
 * Self-leave a room. Personal-room owners cannot leave their own room
 * (it's their default — see leaveRoom helper).
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const result = await leaveRoom(id, userId);

    if (!result.left) {
      return NextResponse.json(
        { error: "Cannot leave (room not found or you are the personal-room owner)" },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[API] DELETE /api/rooms/[id]/leave error:", error);
    return NextResponse.json({ error: "Failed to leave room" }, { status: 500 });
  }
}

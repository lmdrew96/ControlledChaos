import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getRoomByInviteCode, joinRoom } from "@/lib/db/queries";

/**
 * POST /api/rooms/join
 * Body: { inviteCode: string }
 *
 * Codes are unique across rooms, so we resolve the room from the code rather
 * than requiring the client to know the room id up front.
 */
export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      inviteCode?: string;
    };
    const code = body.inviteCode?.trim().toUpperCase();
    if (!code) {
      return NextResponse.json(
        { error: "Invite code is required" },
        { status: 400 }
      );
    }

    const room = await getRoomByInviteCode(code);
    if (!room) {
      return NextResponse.json(
        { error: "No room with that invite code" },
        { status: 404 }
      );
    }

    if (room.expiresAt && room.expiresAt.getTime() < Date.now()) {
      return NextResponse.json({ error: "This room has expired" }, { status: 410 });
    }

    try {
      const result = await joinRoom(room.id, userId);
      return NextResponse.json({
        room: {
          id: room.id,
          name: room.name,
          type: room.type,
          inviteCode: room.inviteCode,
        },
        ...result,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not join";
      const status = /capacity/i.test(msg) ? 409 : 500;
      return NextResponse.json({ error: msg }, { status });
    }
  } catch (error) {
    console.error("[API] POST /api/rooms/join error:", error);
    return NextResponse.json({ error: "Failed to join room" }, { status: 500 });
  }
}

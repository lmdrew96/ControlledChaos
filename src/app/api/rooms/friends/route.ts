import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getRoomsHostedByFriends } from "@/lib/db/queries";

/**
 * GET /api/rooms/friends
 * Returns rooms hosted by the user's accepted friends that the user hasn't
 * joined yet. Live occupancy counts are subscribed to on the client via
 * Convex's `presence.getRoomOccupancy` query rather than fetched here.
 */
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rooms = await getRoomsHostedByFriends(userId);
    return NextResponse.json({
      rooms: rooms.map((r) => ({
        id: r.id,
        name: r.name,
        type: r.type,
        inviteCode: r.inviteCode,
        maxCapacity: r.maxCapacity,
        hostId: r.hostId,
        hostName: r.hostName,
        expiresAt: r.expiresAt?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    console.error("[API] GET /api/rooms/friends error:", error);
    return NextResponse.json(
      { error: "Failed to load friends' rooms" },
      { status: 500 }
    );
  }
}

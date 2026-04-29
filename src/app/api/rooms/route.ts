import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  createAdhocRoom,
  getOrCreatePersonalRoom,
  listRoomsForUser,
} from "@/lib/db/queries";

/**
 * GET /api/rooms
 * Lists every room the current user is a member of, with member counts.
 * Live presence (presentCount) is fetched client-side via the reactive
 * Convex subscription — see PresenceBubbles. Stubbed to 0 here.
 */
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Ensure the user has a personal room before listing.
    await getOrCreatePersonalRoom(userId);

    const rooms = await listRoomsForUser(userId);
    return NextResponse.json({
      rooms: rooms.map((r) => ({
        id: r.id,
        name: r.name,
        type: r.type,
        inviteCode: r.inviteCode,
        maxCapacity: r.maxCapacity,
        memberCount: r.memberCount,
        presentCount: 0, // populated reactively on the client
        isOwner: r.isOwner,
        expiresAt: r.expiresAt,
      })),
    });
  } catch (error) {
    console.error("[API] GET /api/rooms error:", error);
    return NextResponse.json({ error: "Failed to load rooms" }, { status: 500 });
  }
}

/**
 * POST /api/rooms
 * Creates a room.
 *   - { type: "personal" } (or omitted with no other fields) → returns the
 *     user's personal room, creating it on first call.
 *   - { type: "adhoc", name, maxCapacity?, expiresAt? } → creates a new
 *     adhoc room; the creator becomes owner and first member.
 */
export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      type?: string;
      name?: string;
      maxCapacity?: number;
      expiresAt?: string | null;
    };
    const type = body.type ?? "personal";

    if (type === "personal") {
      const room = await getOrCreatePersonalRoom(userId);
      return NextResponse.json({ room });
    }

    if (type === "adhoc") {
      const name = body.name?.trim();
      if (!name) {
        return NextResponse.json(
          { error: "Adhoc rooms require a name" },
          { status: 400 }
        );
      }
      const maxCapacity = Math.max(2, Math.min(body.maxCapacity ?? 8, 16));
      const expiresAt =
        body.expiresAt && !Number.isNaN(Date.parse(body.expiresAt))
          ? new Date(body.expiresAt)
          : null;

      const room = await createAdhocRoom({
        ownerId: userId,
        name,
        maxCapacity,
        expiresAt,
      });
      return NextResponse.json({ room });
    }

    return NextResponse.json({ error: "Unknown room type" }, { status: 400 });
  } catch (error) {
    console.error("[API] POST /api/rooms error:", error);
    return NextResponse.json({ error: "Failed to create room" }, { status: 500 });
  }
}

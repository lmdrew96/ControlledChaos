import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import {
  respondToFriendRequest,
  deleteFriendship,
  getUser,
} from "@/lib/db/queries";
import { sendPushToUser } from "@/lib/notifications/send-push";

interface RouteParams {
  params: Promise<{ friendshipId: string }>;
}

/**
 * PATCH /api/friends/[friendshipId]
 * Accept or decline a friend request.
 * Body: { status: "accepted" | "declined" }
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { friendshipId } = await params;
    const body = await request.json();
    const { status } = body as { status?: string };

    if (status !== "accepted" && status !== "declined") {
      return NextResponse.json({ error: "Status must be 'accepted' or 'declined'" }, { status: 400 });
    }

    const updated = await respondToFriendRequest(friendshipId, userId, status);
    if (!updated) {
      return NextResponse.json({ error: "Friend request not found" }, { status: 404 });
    }

    // Notify the requester on accept
    if (status === "accepted") {
      const accepter = await getUser(userId);
      const name = accepter?.displayName || "Your friend";
      await sendPushToUser(updated.requesterId, {
        title: "Friend request accepted!",
        body: `${name} accepted your friend request`,
        url: "/settings?tab=friends",
        tag: `friend-accepted-${userId}`,
        userId,
      });
    }

    return NextResponse.json({ success: true, friendship: updated });
  } catch (error) {
    console.error("[API] PATCH /api/friends/[friendshipId] error:", error);
    return NextResponse.json({ error: "Failed to respond to friend request" }, { status: 500 });
  }
}

/**
 * DELETE /api/friends/[friendshipId]
 * Remove a friendship (either party can do this).
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { friendshipId } = await params;
    const deleted = await deleteFriendship(friendshipId, userId);
    if (!deleted) {
      return NextResponse.json({ error: "Friendship not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API] DELETE /api/friends/[friendshipId] error:", error);
    return NextResponse.json({ error: "Failed to remove friend" }, { status: 500 });
  }
}

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  findUserByEmail,
  getExistingFriendship,
  createFriendRequest,
  getAcceptedFriends,
  getPendingFriendRequests,
  getUser,
} from "@/lib/db/queries";
import { sendPushToUser } from "@/lib/notifications/send-push";

/**
 * GET /api/friends
 * Returns the user's accepted friends and pending incoming requests.
 */
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [friends, pendingRequests] = await Promise.all([
      getAcceptedFriends(userId),
      getPendingFriendRequests(userId),
    ]);

    return NextResponse.json({ friends, pendingRequests });
  } catch (error) {
    console.error("[API] GET /api/friends error:", error);
    return NextResponse.json({ error: "Failed to load friends" }, { status: 500 });
  }
}

/**
 * POST /api/friends
 * Send a friend request by email.
 * Body: { email: string }
 */
export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { email } = body as { email?: string };

    if (!email || !email.trim()) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Find the target user
    const targetUser = await findUserByEmail(email);
    if (!targetUser) {
      return NextResponse.json(
        { error: "No user found with that email. They need to sign up first!" },
        { status: 404 }
      );
    }

    // Can't friend yourself
    if (targetUser.id === userId) {
      return NextResponse.json({ error: "You can't send a friend request to yourself" }, { status: 400 });
    }

    // Check for existing friendship
    const existing = await getExistingFriendship(userId, targetUser.id);
    if (existing) {
      if (existing.status === "accepted") {
        return NextResponse.json({ error: "You're already friends!" }, { status: 409 });
      }
      if (existing.status === "pending") {
        return NextResponse.json({ error: "A friend request is already pending" }, { status: 409 });
      }
      if (existing.status === "declined") {
        return NextResponse.json({ error: "This friend request was previously declined" }, { status: 409 });
      }
    }

    // Create the friendship
    const friendship = await createFriendRequest(userId, targetUser.id);

    // Notify the target user
    const sender = await getUser(userId);
    const senderName = sender?.displayName || "Someone";
    await sendPushToUser(targetUser.id, {
      title: "Friend request!",
      body: `${senderName} wants to connect with you on ControlledChaos`,
      url: "/settings?tab=friends",
      tag: `friend-request-${userId}`,
      userId,
    });

    return NextResponse.json({ success: true, friendship });
  } catch (error) {
    console.error("[API] POST /api/friends error:", error);
    return NextResponse.json({ error: "Failed to send friend request" }, { status: 500 });
  }
}

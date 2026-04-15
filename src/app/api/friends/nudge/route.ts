import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  getExistingFriendship,
  getUserSettings,
  getUser,
  createNudge,
  getNudgeCountToday,
} from "@/lib/db/queries";
import { sendPushToUser } from "@/lib/notifications/send-push";
import { pickRandomMessage, VALID_CATEGORIES, MAX_NUDGES_PER_FRIEND_PER_DAY, CATEGORY_LABELS } from "@/lib/nudges/messages";
import type { NotificationPrefs, TaskCategory } from "@/types";

/**
 * POST /api/friends/nudge
 * Send a category-based nudge to a friend.
 * Body: { recipientId: string, category: TaskCategory, senderId?: string }
 *
 * When called from the app, senderId comes from Clerk auth.
 * When called from the service worker (nudge_back), senderId is passed in the body
 * (same unauthenticated pattern as the snooze endpoint).
 */
export async function POST(request: Request) {
  try {
    // Try Clerk auth first, fall back to body senderId for SW calls
    const { userId: clerkUserId } = await auth();
    const body = await request.json();
    const { recipientId, category, senderId: bodySenderId } = body as {
      recipientId?: string;
      category?: string;
      senderId?: string;
    };

    const senderId = clerkUserId || bodySenderId;
    if (!senderId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!recipientId) {
      return NextResponse.json({ error: "recipientId is required" }, { status: 400 });
    }

    if (!category || !VALID_CATEGORIES.includes(category as TaskCategory)) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }

    // Verify friendship exists and is accepted
    const friendship = await getExistingFriendship(senderId, recipientId);
    if (!friendship || friendship.status !== "accepted") {
      return NextResponse.json({ error: "You must be friends to send nudges" }, { status: 403 });
    }

    // Check recipient's nudge preferences
    const recipientSettings = await getUserSettings(recipientId);
    const prefs = recipientSettings?.notificationPrefs as NotificationPrefs | null;

    if (prefs?.friendNudgesEnabled === false) {
      return NextResponse.json({ error: "This friend has nudges disabled" }, { status: 403 });
    }

    if (prefs?.mutedFriendIds?.includes(senderId)) {
      return NextResponse.json({ error: "This friend has muted you" }, { status: 403 });
    }

    // Rate limit
    const sender = await getUser(senderId);
    const senderTimezone = sender?.timezone ?? "America/New_York";
    const nudgeCount = await getNudgeCountToday(senderId, recipientId, senderTimezone);

    if (nudgeCount >= MAX_NUDGES_PER_FRIEND_PER_DAY) {
      return NextResponse.json(
        { error: `You've used all ${MAX_NUDGES_PER_FRIEND_PER_DAY} nudges for this friend today` },
        { status: 429 }
      );
    }

    // Pick message and send
    const validCategory = category as TaskCategory;
    const message = pickRandomMessage(validCategory);
    const senderName = sender?.displayName || "A friend";

    await createNudge(senderId, recipientId, validCategory, message);

    await sendPushToUser(recipientId, {
      title: `${CATEGORY_LABELS[validCategory]} nudge from ${senderName}`,
      body: message,
      url: `/tasks?category=${validCategory}`,
      tag: `nudge-${senderId}-${validCategory}`,
      userId: senderId,           // original sender — becomes recipientId on nudge_back
      recipientUserId: recipientId, // recipient — becomes senderId on nudge_back
      actions: [
        { action: "nudge_back", title: "Nudge back" },
      ],
    });

    return NextResponse.json({
      success: true,
      nudgesRemaining: MAX_NUDGES_PER_FRIEND_PER_DAY - nudgeCount - 1,
    });
  } catch (error) {
    console.error("[API] POST /api/friends/nudge error:", error);
    return NextResponse.json({ error: "Failed to send nudge" }, { status: 500 });
  }
}

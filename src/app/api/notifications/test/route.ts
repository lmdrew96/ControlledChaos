import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { sendPushToUser } from "@/lib/notifications/send-push";

/** POST — send a test push notification to the current user */
export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sent = await sendPushToUser(userId, {
      title: "ControlledChaos",
      body: "Push notifications are working! You're all set.",
      url: "/settings",
      tag: "cc-test",
    });

    return NextResponse.json({
      success: sent,
      message: sent
        ? "Test notification sent!"
        : "No push subscriptions found. Enable push notifications in Settings first.",
    });
  } catch (error) {
    console.error("[API] POST /api/notifications/test error:", error);
    return NextResponse.json(
      { error: "Failed to send test notification" },
      { status: 500 }
    );
  }
}

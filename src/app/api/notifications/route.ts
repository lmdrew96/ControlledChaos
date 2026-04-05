import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  getRecentNotifications,
  getUnreadNotificationCount,
  markAllNotificationsOpened,
  markNotificationOpened,
} from "@/lib/db/queries";

/** GET — recent notifications + unread count */
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [notifications, unreadCount] = await Promise.all([
      getRecentNotifications(userId, 50),
      getUnreadNotificationCount(userId),
    ]);

    return NextResponse.json({ notifications, unreadCount });
  } catch (error) {
    console.error("[API] GET /api/notifications error:", error);
    return NextResponse.json(
      { error: "Failed to fetch notifications" },
      { status: 500 }
    );
  }
}

/** PUT — mark ALL notifications as read */
export async function PUT() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await markAllNotificationsOpened(userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API] PUT /api/notifications error:", error);
    return NextResponse.json(
      { error: "Failed to mark all notifications" },
      { status: 500 }
    );
  }
}

/** PATCH — mark a single notification as opened */
export async function PATCH(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { notificationId } = body;

    if (!notificationId) {
      return NextResponse.json(
        { error: "notificationId is required" },
        { status: 400 }
      );
    }

    const updated = await markNotificationOpened(notificationId, userId);
    return NextResponse.json({ success: !!updated });
  } catch (error) {
    console.error("[API] PATCH /api/notifications error:", error);
    return NextResponse.json(
      { error: "Failed to mark notification" },
      { status: 500 }
    );
  }
}

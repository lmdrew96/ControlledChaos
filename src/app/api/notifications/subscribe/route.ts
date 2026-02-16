import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  createPushSubscription,
  deletePushSubscription,
} from "@/lib/db/queries";

/** POST — save a push subscription */
export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { endpoint, keys } = body as {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
    };

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json(
        { error: "Missing endpoint or keys" },
        { status: 400 }
      );
    }

    const sub = await createPushSubscription(
      userId,
      endpoint,
      keys.p256dh,
      keys.auth
    );

    return NextResponse.json({ success: true, id: sub.id });
  } catch (error) {
    console.error("[API] POST /api/notifications/subscribe error:", error);
    return NextResponse.json(
      { error: "Failed to save subscription" },
      { status: 500 }
    );
  }
}

/** DELETE — remove a push subscription */
export async function DELETE(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { endpoint } = body as { endpoint?: string };

    if (!endpoint) {
      return NextResponse.json(
        { error: "Missing endpoint" },
        { status: 400 }
      );
    }

    await deletePushSubscription(userId, endpoint);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API] DELETE /api/notifications/subscribe error:", error);
    return NextResponse.json(
      { error: "Failed to remove subscription" },
      { status: 500 }
    );
  }
}

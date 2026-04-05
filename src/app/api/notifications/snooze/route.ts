import { NextResponse } from "next/server";
import { createSnoozedPush } from "@/lib/db/queries";

/**
 * POST /api/notifications/snooze
 * Called by the service worker when the user taps "Snooze" on a push notification.
 * No auth session required — userId is validated to exist by the insert FK constraint.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { userId, title, body: notifBody, url, tag, minutes } = body as {
    userId?: string;
    title?: string;
    body?: string;
    url?: string;
    tag?: string;
    minutes?: number;
  };

  if (!userId || !title || !notifBody) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const delayMinutes = Math.min(Math.max(minutes ?? 30, 5), 120); // Clamp 5–120 min
  const sendAfter = new Date(Date.now() + delayMinutes * 60 * 1000);

  try {
    await createSnoozedPush(userId, { title, body: notifBody, url, tag }, sendAfter);
    return NextResponse.json({ success: true, sendAfter });
  } catch (error) {
    console.error("[Snooze] Failed to create snoozed push:", error);
    return NextResponse.json({ error: "Failed to snooze notification" }, { status: 500 });
  }
}

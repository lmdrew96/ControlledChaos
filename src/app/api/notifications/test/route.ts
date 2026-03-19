import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import webpush from "@/lib/notifications/webpush-client";
import { getPushSubscriptions, getUserSettings, getUser, createNotification } from "@/lib/db/queries";
import type { NotificationPrefs } from "@/types";

/** POST — send a test push notification and return diagnostic info */
export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const diag: Record<string, unknown> = {};

    // 1. VAPID configured?
    diag.vapidPublicKeySet = !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    diag.vapidPrivateKeySet = !!process.env.VAPID_PRIVATE_KEY;

    // 2. Subscriptions in DB?
    const subscriptions = await getPushSubscriptions(userId);
    diag.subscriptionCount = subscriptions.length;
    diag.subscriptions = subscriptions.map((s) => ({
      endpoint: s.endpoint.slice(0, 60) + "…",
      createdAt: s.createdAt,
    }));

    if (subscriptions.length === 0) {
      return NextResponse.json({
        success: false,
        message: "No push subscriptions in DB. Toggle push off/on in Settings to re-subscribe.",
        diag,
      });
    }

    // 3. User prefs
    const [settings, user] = await Promise.all([
      getUserSettings(userId),
      getUser(userId),
    ]);
    const prefs = settings?.notificationPrefs as NotificationPrefs | null;
    diag.pushEnabledInPrefs = prefs?.pushEnabled ?? null;
    diag.timezone = user?.timezone ?? "America/New_York";
    diag.quietHoursStart = prefs?.quietHoursStart ?? null;
    diag.quietHoursEnd = prefs?.quietHoursEnd ?? null;

    // 4. Try sending to each subscription
    const results: { endpoint: string; success: boolean; error?: string }[] = [];

    const payload = JSON.stringify({
      title: "ControlledChaos",
      body: "Push notifications are working! You're all set.",
      url: "/settings",
      tag: "cc-test",
    });

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.keysP256dh, auth: sub.keysAuth },
          },
          payload
        );
        results.push({ endpoint: sub.endpoint.slice(0, 60) + "…", success: true });
      } catch (err: unknown) {
        const e = err as { statusCode?: number; body?: string; message?: string };
        results.push({
          endpoint: sub.endpoint.slice(0, 60) + "…",
          success: false,
          error: `status=${e.statusCode} body=${e.body} msg=${e.message}`,
        });
      }
    }

    diag.sendResults = results;
    const anySent = results.some((r) => r.success);

    if (anySent) {
      await createNotification(userId, "push", {
        title: "ControlledChaos",
        body: "Push notifications are working! You're all set.",
        url: "/settings",
        tag: "cc-test",
      });
    }

    return NextResponse.json({
      success: anySent,
      message: anySent
        ? "Push sent to push service. If you still see nothing, the issue is browser/OS delivery."
        : "webpush.sendNotification failed for all subscriptions — check diag for error details.",
      diag,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Test failed", detail: String(error) },
      { status: 500 }
    );
  }
}

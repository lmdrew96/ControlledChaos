import { NextResponse } from "next/server";
import { createSnoozedPush } from "@/lib/db/queries";
import { verifySnoozeToken } from "@/lib/notifications/snooze-token";

/**
 * POST /api/notifications/snooze
 * Called by the service worker when the user taps "Snooze" on a push. Public
 * (the SW may have no Clerk session), so the ONLY authority is the signed
 * snoozeToken minted into that push: it names the user and the task. Nothing
 * else in the body is trusted beyond the clamped delay.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { token, minutes } = (body ?? {}) as { token?: unknown; minutes?: unknown };
  const claims = typeof token === "string" ? verifySnoozeToken(token) : null;
  if (!claims) {
    return NextResponse.json({ error: "Invalid snooze token" }, { status: 401 });
  }

  const requested = typeof minutes === "number" && Number.isFinite(minutes) ? minutes : 30;
  const delayMinutes = Math.min(Math.max(requested, 5), 120); // Clamp 5–120 min
  const sendAfter = new Date(Date.now() + delayMinutes * 60 * 1000);

  try {
    await createSnoozedPush(claims.userId, { taskId: claims.taskId, tag: claims.tag }, sendAfter);
    return NextResponse.json({ success: true, sendAfter });
  } catch (error) {
    console.error("[Snooze] Failed to create snoozed push:", error);
    return NextResponse.json({ error: "Failed to snooze notification" }, { status: 500 });
  }
}

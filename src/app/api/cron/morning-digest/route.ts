import { NextResponse } from "next/server";
import { getAllUsersWithNotificationPrefs } from "@/lib/db/queries";
import { sendMorningDigest } from "@/lib/notifications/send-email";
import { hasBeenNotifiedToday } from "@/lib/notifications/triggers";
import { todayInTimezone, hasLocalTimeArrivedToday } from "@/lib/timezone";
import { verifyCronRequest } from "@/lib/cron-auth";

// Vercel Pro: 60s max. Default (10s) silently truncates the per-user digest loop.
export const maxDuration = 60;

/**
 * POST /api/cron/morning-digest
 * Triggered by a QStash schedule within the 6am-4pm UTC window (falls back
 * to CRON_SECRET bearer auth for manual/local calls). For each user with
 * morning digest enabled, sends on the first poll at or after their
 * configured digest time, deduped per day — not a window match, since the
 * poller's cadence isn't guaranteed to land inside one.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!(await verifyCronRequest(request, rawBody))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const force = new URL(request.url).searchParams.get("force") === "true";

  try {
    const users = await getAllUsersWithNotificationPrefs();
    let sent = 0;

    for (const { userId, timezone, prefs } of users) {
      if (!prefs?.emailMorningDigest) continue;

      if (!force && !hasLocalTimeArrivedToday(prefs.morningDigestTime, timezone)) continue;

      // Dedup: don't send twice in the same day (skip in force mode)
      const dedupKey = `morning-digest-${todayInTimezone(timezone)}`;
      if (!force && await hasBeenNotifiedToday(userId, dedupKey, timezone)) continue;

      const ok = await sendMorningDigest(userId);
      if (ok) sent++;
    }

    return NextResponse.json({ success: true, sent });
  } catch (error) {
    console.error("[Cron] morning-digest error:", error);
    return NextResponse.json({ error: "Cron job failed" }, { status: 500 });
  }
}

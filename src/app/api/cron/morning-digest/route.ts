import { NextResponse } from "next/server";
import { getAllUsersWithNotificationPrefs } from "@/lib/db/queries";
import { sendMorningDigest } from "@/lib/notifications/send-email";
import { hasBeenNotifiedToday } from "@/lib/notifications/triggers";
import { todayInTimezone, hasLocalTimeArrivedToday } from "@/lib/timezone";

// Vercel Pro: 60s max. Default (10s) silently truncates the per-user digest loop.
export const maxDuration = 60;

/**
 * GET /api/cron/morning-digest
 * Runs every 15 minutes (6am–11am UTC covers most US timezones).
 * For each user with morning digest enabled, sends on the first poll at or
 * after their configured digest time, deduped per day — not a window match,
 * since the poller's cadence isn't guaranteed to land inside one.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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

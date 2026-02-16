import { NextResponse } from "next/server";
import { getAllUsersWithDigestEnabled } from "@/lib/db/queries";
import { sendMorningDigest } from "@/lib/notifications/send-email";
import { hasBeenNotifiedToday } from "@/lib/notifications/triggers";

/**
 * POST /api/cron/morning-digest
 * Runs every 15 minutes (6am–11am UTC covers most US timezones).
 * For each user with morning digest enabled, checks if their configured
 * digest time matches the current time (±15min window), then sends.
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const users = await getAllUsersWithDigestEnabled();
    let sent = 0;

    for (const { userId, timezone, prefs } of users) {
      if (!prefs?.emailMorningDigest) continue;

      // Check if current time is within ±15min of their configured digest time
      if (!isWithinWindow(prefs.morningDigestTime, timezone, 15)) continue;

      // Dedup: don't send twice in the same day
      const dedupKey = `morning-digest-${new Date().toISOString().slice(0, 10)}`;
      if (await hasBeenNotifiedToday(userId, dedupKey)) continue;

      const ok = await sendMorningDigest(userId);
      if (ok) sent++;
    }

    return NextResponse.json({ success: true, sent });
  } catch (error) {
    console.error("[Cron] morning-digest error:", error);
    return NextResponse.json({ error: "Cron job failed" }, { status: 500 });
  }
}

/**
 * Check if the current time in the user's timezone is within ±windowMin
 * of their configured time (e.g., "07:30").
 */
function isWithinWindow(
  configuredTime: string,
  timezone: string,
  windowMin: number
): boolean {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const currentTime = formatter.format(now); // "HH:MM"

  const [cH, cM] = configuredTime.split(":").map(Number);
  const [nH, nM] = currentTime.split(":").map(Number);

  const configMinutes = cH * 60 + cM;
  const nowMinutes = nH * 60 + nM;

  const diff = Math.abs(configMinutes - nowMinutes);
  return diff <= windowMin || diff >= 1440 - windowMin; // handle midnight wrap
}

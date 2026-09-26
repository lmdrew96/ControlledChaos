/**
 * Exact-minute pushes.
 *
 * push-triggers runs every 10 minutes, so on its own every reminder lands on
 * :00/:10/:20: a "10 min before" for a 12:45 class went out at 12:40. Nae's
 * rule is that a push arrives when something is actually due, never on a
 * perceptible beat. So each tick also looks ahead: for every moment in the
 * next window when a reminder band opens, it asks QStash to call push-triggers
 * back at that moment for that one user ("a fire"). The fire re-runs the
 * normal upcoming-alert logic right then, so edits, deletes, dedup keys, quiet
 * hours and clustering all behave exactly as they do in a tick. A fire only
 * decides when to look, never what to send.
 *
 * Needs QSTASH_TOKEN (a Worker runtime secret). Without it, nothing here runs
 * and the cron sends on its grid as before.
 */
import { Client } from "@upstash/qstash";

/** This account's QStash lives in the US region; the SDK defaults to EU. */
const QSTASH_BASE_URL = "https://qstash-us-east-1.upstash.io";

/**
 * A fire lands this long after the last band in its minute opens. At the exact
 * edge a small clock difference could put "now" a hair before the band and
 * find nothing due.
 */
export const FIRE_OFFSET_MS = 5_000;

/**
 * Past the tick's 10 minutes, so a late or slow tick doesn't leave a gap. The
 * overlap with the next tick is harmless: fires are deduplicated per minute.
 */
export const FIRE_HORIZON_MS = 12 * 60_000;

/**
 * In exact mode the tick itself only sends reminders whose band opened at
 * least this long ago: those are the ones a fire should already have sent,
 * and the tick is the fallback if it didn't. Anything younger is left to its
 * fire, so the two never race to send the same push.
 */
export const FIRE_GRACE_MS = 2 * 60_000;

export function isExactFireEnabled(): boolean {
  return !!process.env.QSTASH_TOKEN;
}

/**
 * Band openings → one fire per minute. Everything opening within the same
 * minute shares a fire (so it still combines into one push), timed just after
 * the last of them.
 */
export function fireTimesFor(bandOpens: Date[], now: Date): Date[] {
  const latestByMinute = new Map<number, number>();
  for (const open of bandOpens) {
    const ms = open.getTime();
    if (ms <= now.getTime()) continue;
    const minute = Math.floor(ms / 60_000);
    latestByMinute.set(minute, Math.max(latestByMinute.get(minute) ?? 0, ms));
  }
  return [...latestByMinute.values()]
    .sort((a, b) => a - b)
    .map((ms) => new Date(ms + FIRE_OFFSET_MS));
}

let client: Client | null = null;

/**
 * Ask QStash to call `url` back for `userId` at each time. The deduplication
 * id is the user and the minute, so overlapping ticks never double-book.
 * Returns how many were scheduled; failures are logged, never thrown — a lost
 * fire only means the tick's fallback sends that reminder a few minutes late.
 */
export async function scheduleFires(
  userId: string,
  fireTimes: Date[],
  url: string
): Promise<number> {
  if (fireTimes.length === 0) return 0;
  client ??= new Client({ token: process.env.QSTASH_TOKEN!, baseUrl: QSTASH_BASE_URL });

  const results = await Promise.allSettled(
    fireTimes.map((at) =>
      client!.publishJSON({
        url,
        body: { fire: { userId } },
        notBefore: Math.ceil(at.getTime() / 1000),
        deduplicationId: `push-fire-${userId}-${Math.floor(at.getTime() / 60_000)}`,
        retries: 2,
      })
    )
  );

  let scheduled = 0;
  results.forEach((r, i) => {
    if (r.status === "fulfilled") scheduled++;
    else console.error(`[Push][Fire] schedule failed user=${userId} at=${fireTimes[i].toISOString()}:`, r.reason);
  });
  return scheduled;
}

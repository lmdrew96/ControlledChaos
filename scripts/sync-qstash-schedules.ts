/**
 * Source of truth for ControlledChaos's QStash cron schedules.
 *
 * These four schedules used to live only in the Upstash console, where they
 * drifted from intent unnoticed: they inherited GH Actions' old off-round-
 * minute offset (7,22,37,52 — a congestion dodge QStash doesn't need) and
 * added up to 15 minutes of pure delivery lag. SCHEDULES below is now the
 * canonical definition, and this script reconciles the live config to it.
 *
 * Usage:
 *   npx tsx scripts/sync-qstash-schedules.ts           report drift, change nothing
 *   npx tsx scripts/sync-qstash-schedules.ts --apply    reconcile live to match
 *
 * Check mode exits non-zero when live config differs, so it doubles as a CI
 * drift gate. Extra schedules are always reported, never deleted — removing
 * live scheduling is a human decision.
 */

import { Client } from "@upstash/qstash";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

/**
 * This account's schedules live in the US region. `new Client({ token })`
 * defaults to eu-central-1 and 404s with "user not found in this region".
 */
const QSTASH_BASE_URL = "https://qstash-us-east-1.upstash.io";

/**
 * The *.vercel.app production domain, not controlledchaos.adhdesigns.dev:
 * the custom domain is proxied through Cloudflare, whose bot protection can
 * challenge third-party callers before the request reaches Vercel.
 */
const CRON_ORIGIN = "https://controlledchaos-app.vercel.app";

/** QStash's own default. Restated explicitly because create() replaces all fields. */
const RETRIES = 3;

type ScheduleDef = {
  /** Route under /api/cron — also the key we match live schedules on. */
  route: string;
  cron: string;
  /** Why this cadence, so a future retune has the reasoning in front of it. */
  rationale: string;
};

/** Canonical cadence. Last retuned 2026-09-20 (v2.58.0). */
const SCHEDULES: ScheduleDef[] = [
  {
    route: "push-triggers",
    cron: "*/10 * * * *",
    rationale:
      "Was */2. That 7.5x tick rate on the most expensive route (per-user AI generation) spiked Vercel CPU billing. Kept at */10 rather than slower — it drives the 'time to start' nudges, which are the point of the app.",
  },
  {
    route: "calendar-sync",
    cron: "*/30 * * * *",
    rationale: "Was */15. Canvas iCal feeds update slowly on Canvas's side; 30min loses nothing.",
  },
  {
    route: "morning-digest",
    cron: "*/15 6-16 * * *",
    rationale:
      "6am-4pm UTC window. Was */5 all day: 216 ticks/day to send two emails, each a cold Node function loading resend + @react-email/components before almost always bailing. */15 caps lateness at 15min, invisible for a 'here is your day' email.",
  },
  {
    route: "evening-digest",
    cron: "*/15 22-23,0-4 * * *",
    rationale: "10pm-4am UTC window. Same reasoning as morning-digest.",
  },
];

const destinationFor = (def: ScheduleDef): string => `${CRON_ORIGIN}/api/cron/${def.route}`;

type Drift = { field: string; live: string; want: string };

const main = async () => {
  const apply = process.argv.includes("--apply");

  const token = process.env.QSTASH_TOKEN;
  if (!token) {
    console.error("QSTASH_TOKEN missing — expected in .env.local");
    process.exit(1);
  }

  // `schedules` is a getter, not a method: client.schedules() throws.
  const client = new Client({ token, baseUrl: QSTASH_BASE_URL });
  const live = await client.schedules.list();

  const byDestination = new Map(live.map((s) => [s.destination, s]));
  const known = new Set(SCHEDULES.map(destinationFor));

  let drifted = 0;

  for (const def of SCHEDULES) {
    const destination = destinationFor(def);
    const existing = byDestination.get(destination);

    if (!existing) {
      drifted++;
      console.log(`  MISSING   ${def.route}  ->  want cron "${def.cron}"`);
      if (apply) {
        const { scheduleId } = await client.schedules.create({
          destination,
          cron: def.cron,
          method: "POST",
          retries: RETRIES,
        });
        console.log(`            created ${scheduleId}`);
      }
      continue;
    }

    const diffs: Drift[] = [];
    if (existing.cron !== def.cron) {
      diffs.push({ field: "cron", live: existing.cron, want: def.cron });
    }
    if (existing.method !== "POST") {
      diffs.push({ field: "method", live: existing.method, want: "POST" });
    }
    if (existing.retries !== RETRIES) {
      diffs.push({ field: "retries", live: String(existing.retries), want: String(RETRIES) });
    }
    if (existing.isPaused) {
      diffs.push({ field: "paused", live: "true", want: "false" });
    }

    if (diffs.length === 0) {
      console.log(`  OK        ${def.route}  ${def.cron}`);
      continue;
    }

    drifted++;
    console.log(`  DRIFT     ${def.route}  (${existing.scheduleId})`);
    for (const d of diffs) {
      console.log(`            ${d.field}: live "${d.live}"  ->  want "${d.want}"`);
    }

    if (apply) {
      // Passing an existing scheduleId updates in place and preserves the ID,
      // but replaces ALL fields — method and retries must be restated or they
      // silently reset to defaults.
      await client.schedules.create({
        destination,
        cron: def.cron,
        scheduleId: existing.scheduleId,
        method: "POST",
        retries: RETRIES,
      });
      if (existing.isPaused) await client.schedules.resume({ schedule: existing.scheduleId });
      console.log(`            updated in place`);
    }
  }

  const extras = live.filter((s) => !known.has(s.destination));
  for (const extra of extras) {
    drifted++;
    console.log(`  UNEXPECTED  ${extra.destination}  ${extra.cron}  (${extra.scheduleId})`);
    console.log(`              not in SCHEDULES — delete by hand if it's dead`);
  }

  console.log("");
  if (drifted === 0) {
    console.log(`  ${SCHEDULES.length} schedules match the committed definition.\n`);
    return;
  }
  if (apply) {
    console.log(`  Reconciled ${drifted} difference(s). Re-run without --apply to confirm.\n`);
    return;
  }
  console.log(`  ${drifted} difference(s). Re-run with --apply to reconcile.\n`);
  process.exitCode = 1;
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

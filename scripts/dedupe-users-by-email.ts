/**
 * Consolidate duplicate users that share the same email.
 *
 * Background: `users.id` is the Clerk user id and was the only uniqueness
 * check for a long time. When Clerk rotated user_ids (dev → prod migration,
 * account re-creation, etc.) `ensureUser` happily inserted a new row for
 * the same person. Each duplicate ran onboarding fresh and got its own
 * `user_settings.notification_prefs`, which the digest cron then dutifully
 * delivered to the same email address — sometimes with `emailEveningDigest`
 * stuck at `true` because the user toggled it off on the *current* row only.
 *
 * Run this once before applying the unique index on `users(LOWER(email))`
 * and `user_settings(user_id)` — the migration will fail otherwise.
 *
 * Usage:
 *   npx tsx scripts/dedupe-users-by-email.ts
 *
 * For each email cluster the script:
 *   1. Lists every users row sharing the email (oldest → newest)
 *   2. Asks which row to keep (the canonical id all data merges into)
 *   3. Reassigns every FK reference from the duplicate ids to the canonical id
 *   4. Removes the now-empty duplicate user_settings + users rows
 *
 * The cascade tables mirror scripts/remap-clerk-ids.ts. Keep them in sync
 * when adding new tables that reference users.id.
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { neon } from "@neondatabase/serverless";
import * as readline from "readline";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set. Make sure .env.local is loaded.");
  process.exit(1);
}

const sql = neon(DATABASE_URL);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

// Tables with a `user_id` column referencing users.id, whose rows we want
// to re-point from duplicate → canonical (preserving the user's data).
//
// `user_settings` is intentionally NOT in this list: the canonical row
// already has its own settings (the one the user explicitly chose to keep,
// usually because it has the correct notification toggles), and we want to
// discard the duplicate's settings outright rather than fan them out.
const CHILD_TABLES = [
  "goals",
  "brain_dumps",
  "moments",
  "tasks",
  "calendar_events",
  "locations",
  "commute_times",
  "user_locations",
  "location_notification_log",
  "task_activity",
  "notifications",
  "crisis_plans",
  "crisis_messages",
  "crisis_detections",
  "push_subscriptions",
  "snoozed_pushes",
  "medications",
  "medication_logs",
];

// Tables with non-standard user-reference columns
const SPECIAL_USER_COLUMNS: Array<[string, string]> = [
  ["friendships", "requester_id"],
  ["friendships", "addressee_id"],
  ["nudges", "sender_id"],
  ["nudges", "recipient_id"],
];

type UserRow = {
  id: string;
  email: string;
  display_name: string | null;
  created_at: string;
  settings_count: number;
  has_prefs: boolean;
  prefs_summary: string;
};

async function fetchClusters(): Promise<Map<string, UserRow[]>> {
  const rows = (await sql`
    SELECT
      u.id,
      u.email,
      u.display_name,
      u.created_at,
      COUNT(s.id)::int AS settings_count,
      BOOL_OR(s.notification_prefs IS NOT NULL) AS has_prefs,
      STRING_AGG(
        CASE
          WHEN s.notification_prefs IS NOT NULL
          THEN CONCAT(
            'morning=', COALESCE(s.notification_prefs->>'emailMorningDigest', '?'),
            ' evening=', COALESCE(s.notification_prefs->>'emailEveningDigest', '?')
          )
          ELSE 'no prefs'
        END,
        ' | '
      ) AS prefs_summary
    FROM users u
    LEFT JOIN user_settings s ON s.user_id = u.id
    GROUP BY u.id, u.email, u.display_name, u.created_at
    ORDER BY LOWER(u.email), u.created_at
  `) as UserRow[];

  const clusters = new Map<string, UserRow[]>();
  for (const r of rows) {
    const key = (r.email ?? "").toLowerCase();
    if (!clusters.has(key)) clusters.set(key, []);
    clusters.get(key)!.push(r);
  }
  // Only keep clusters with a true duplicate
  for (const [key, list] of clusters) {
    if (list.length < 2) clusters.delete(key);
  }
  return clusters;
}

async function mergeInto(canonicalId: string, duplicateId: string) {
  // 1. Discard the duplicate's user_settings rows. Their notification_prefs
  //    are exactly what's been firing the cron at the wrong address, and
  //    the canonical user has its own settings already.
  await sql`DELETE FROM user_settings WHERE user_id = ${duplicateId}`;

  // 2. Re-point every other FK from duplicate → canonical so the user's
  //    tasks, goals, moments, etc. follow the canonical id. Neon's HTTP
  //    driver has no transactions, so we run statements sequentially; if a
  //    step fails the script can be re-run safely — every operation is
  //    idempotent (already-pointed rows just match zero rows next time).
  for (const table of CHILD_TABLES) {
    await sql.query(
      `UPDATE "${table}" SET user_id = $1 WHERE user_id = $2`,
      [canonicalId, duplicateId],
    );
  }
  for (const [table, column] of SPECIAL_USER_COLUMNS) {
    await sql.query(
      `UPDATE "${table}" SET "${column}" = $1 WHERE "${column}" = $2`,
      [canonicalId, duplicateId],
    );
  }

  // 3. Drop the duplicate user row. All children have been moved above so
  //    the FK constraint is satisfied.
  await sql`DELETE FROM users WHERE id = ${duplicateId}`;
}

async function main() {
  console.log("\n=== User Email Dedupe ===\n");
  const clusters = await fetchClusters();

  if (clusters.size === 0) {
    console.log("No duplicate emails found. Nothing to do.");
    rl.close();
    return;
  }

  console.log(`Found ${clusters.size} email(s) with duplicate user rows.\n`);

  for (const [email, rows] of clusters) {
    console.log(`\n--- ${email} (${rows.length} rows) ---`);
    rows.forEach((r, i) => {
      console.log(
        `  [${i + 1}] id=${r.id}`,
      );
      console.log(
        `      created=${r.created_at}  name=${r.display_name ?? "(none)"}`,
      );
      console.log(
        `      settings_rows=${r.settings_count}  prefs=${r.prefs_summary}`,
      );
    });

    const choice = await ask(
      `\nKeep which row as canonical? Enter 1-${rows.length}, or 's' to skip: `,
    );
    const skipped = choice.trim().toLowerCase() === "s";
    const idx = Number(choice) - 1;
    if (skipped || !Number.isInteger(idx) || idx < 0 || idx >= rows.length) {
      console.log("  → skipped\n");
      continue;
    }

    const canonical = rows[idx];
    const duplicates = rows.filter((_, i) => i !== idx);
    console.log(`  → keeping ${canonical.id}, merging ${duplicates.length} duplicate(s)`);

    for (const dup of duplicates) {
      try {
        await mergeInto(canonical.id, dup.id);
        console.log(`    ✓ merged ${dup.id}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`    ✗ failed merging ${dup.id}: ${msg}`);
        console.error("    Stopping to prevent partial state. Fix and re-run.");
        rl.close();
        process.exit(1);
      }
    }
  }

  // Final pass: a single user can also have multiple user_settings rows
  // independently of the email-dupe problem (the onboarding double-submit
  // race). The user_settings unique index will reject those at migration
  // time, so collapse them now. Keep the row with notification_prefs set
  // when there's a choice; otherwise an arbitrary row.
  const settingsDupes = (await sql`
    SELECT user_id, COUNT(*)::int AS n
    FROM user_settings
    GROUP BY user_id
    HAVING COUNT(*) > 1
  `) as Array<{ user_id: string; n: number }>;

  if (settingsDupes.length > 0) {
    console.log(`\nCollapsing duplicate user_settings rows for ${settingsDupes.length} user(s)...`);
    for (const { user_id } of settingsDupes) {
      await sql`
        DELETE FROM user_settings
        WHERE user_id = ${user_id}
          AND id NOT IN (
            SELECT id FROM user_settings
            WHERE user_id = ${user_id}
            ORDER BY (notification_prefs IS NOT NULL) DESC, id ASC
            LIMIT 1
          )
      `;
      console.log(`  ✓ ${user_id}`);
    }
  }

  rl.close();
  console.log("\n✅ Dedupe complete.");
  console.log(
    "Next: run `pnpm db:generate && pnpm db:migrate` to apply the unique indexes.",
  );
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

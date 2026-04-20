/**
 * Keep only the most recent push_subscriptions row per user.
 * Diagnoses + cleans up the "getting N notifications per push" bug that
 * happens when PWA re-subscriptions leave stale endpoints behind.
 *
 * Usage:
 *   npx tsx scripts/dedupe-push-subscriptions.ts           # preview only
 *   npx tsx scripts/dedupe-push-subscriptions.ts --apply   # actually delete
 */

import { neon } from "@neondatabase/serverless";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const APPLY = process.argv.includes("--apply");

async function main() {
  const sql = neon(process.env.DATABASE_URL!);

  const counts = await sql`
    SELECT user_id, COUNT(*)::int AS n
    FROM push_subscriptions
    GROUP BY user_id
    HAVING COUNT(*) > 1
    ORDER BY n DESC
  `;

  if (counts.length === 0) {
    console.log("✓ No users have duplicate push subscriptions. Nothing to do.");
    return;
  }

  console.log(`\nUsers with duplicate subscriptions: ${counts.length}\n`);

  let totalToDelete = 0;

  for (const { user_id, n } of counts) {
    const rows = await sql`
      SELECT id, endpoint, created_at
      FROM push_subscriptions
      WHERE user_id = ${user_id}
      ORDER BY created_at DESC
    `;

    const [keep, ...drop] = rows;
    totalToDelete += drop.length;

    console.log(`  user=${user_id}  rows=${n}`);
    console.log(`    keep: ${keep.id}  (${new Date(keep.created_at).toISOString()})`);
    for (const d of drop) {
      console.log(`    drop: ${d.id}  (${new Date(d.created_at).toISOString()})`);
    }
  }

  console.log(`\nTotal rows to delete: ${totalToDelete}`);

  if (!APPLY) {
    console.log("\nDry run. Re-run with --apply to actually delete.");
    return;
  }

  console.log("\nDeleting...");
  let deleted = 0;
  for (const { user_id } of counts) {
    const result = await sql`
      DELETE FROM push_subscriptions
      WHERE user_id = ${user_id}
        AND id NOT IN (
          SELECT id FROM push_subscriptions
          WHERE user_id = ${user_id}
          ORDER BY created_at DESC
          LIMIT 1
        )
      RETURNING id
    `;
    deleted += result.length;
  }
  console.log(`✓ Deleted ${deleted} stale subscription rows.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

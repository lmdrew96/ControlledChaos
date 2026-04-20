/**
 * Remap Clerk user IDs after switching from dev → production.
 *
 * Usage:
 *   npx tsx scripts/remap-clerk-ids.ts
 *
 * Prerequisites:
 *   - DATABASE_URL set in .env.local (or exported)
 *   - All users have signed in via production Clerk so you have their new IDs
 *     (go to Clerk dashboard → Users → click user → copy the user ID)
 *
 * The script shows each existing user (email) and asks for their new
 * production Clerk ID. It then updates every table sequentially.
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

// Every table with a user_id column that references users.id
const CHILD_TABLES = [
  "user_settings",
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

// Tables that reference users.id via columns OTHER than user_id
// Each entry: [table, column]
const SPECIAL_USER_COLUMNS: Array<[string, string]> = [
  ["friendships", "requester_id"],
  ["friendships", "addressee_id"],
  ["nudges", "sender_id"],
  ["nudges", "recipient_id"],
];

async function remapUser(oldId: string, newId: string, email: string) {
  console.log(`\nRemapping ${email}...`);

  // Step 1: Temporarily disable FK checks by inserting a placeholder row
  // with the new ID, so child rows can point to it
  console.log("  Creating temporary user row with new ID...");
  const existing = await sql`SELECT id, email, display_name, timezone, created_at, updated_at FROM users WHERE id = ${oldId}`;
  if (existing.length === 0) {
    console.error(`  ✗ No user found with ID ${oldId}. Skipping.`);
    return;
  }
  const user = existing[0];

  // Check if new ID already exists (user already signed in to production)
  const alreadyExists = await sql`SELECT id FROM users WHERE id = ${newId}`;
  if (alreadyExists.length > 0) {
    console.log("  New user ID already exists in users table — will merge into it.");
  } else {
    // Insert new user row so FK constraints are satisfied when we update children
    await sql`INSERT INTO users (id, email, display_name, timezone, created_at, updated_at)
              VALUES (${newId}, ${user.email}, ${user.display_name}, ${user.timezone}, ${user.created_at}, ${user.updated_at})`;
  }

  // Step 2: Update all child tables (user_id column)
  for (const table of CHILD_TABLES) {
    await sql.query(`UPDATE "${table}" SET user_id = $1 WHERE user_id = $2`, [newId, oldId]);
    console.log(`  ✓ ${table}`);
  }

  // Step 2b: Update tables with non-standard user-reference columns
  for (const [table, column] of SPECIAL_USER_COLUMNS) {
    await sql.query(`UPDATE "${table}" SET "${column}" = $1 WHERE "${column}" = $2`, [newId, oldId]);
    console.log(`  ✓ ${table}.${column}`);
  }

  // Step 3: Delete the old user row (children now point to new ID)
  await sql`DELETE FROM users WHERE id = ${oldId}`;
  console.log(`  ✓ Removed old user row (${oldId})`);
  console.log(`  ✓ Done — ${email} is now ${newId}`);
}

async function main() {
  console.log("\n=== Clerk ID Remapper ===\n");
  console.log("Fetching existing users from database...\n");

  const users = await sql`SELECT id, email, display_name FROM users ORDER BY created_at`;

  if (users.length === 0) {
    console.log("No users found in the database. Nothing to remap.");
    rl.close();
    return;
  }

  console.log(`Found ${users.length} user(s):\n`);
  for (const user of users) {
    console.log(`  ${user.email || "(no email)"} — ${user.display_name || "(no name)"}`);
    console.log(`    Current (dev) ID: ${user.id}\n`);
  }

  // Collect new IDs
  const remaps: { oldId: string; newId: string; email: string }[] = [];

  for (const user of users) {
    const label = user.email || user.display_name || user.id;
    const newId = await ask(
      `New production Clerk ID for ${label}\n  (paste the user_xxx ID, or press Enter to skip): `
    );

    if (newId.trim()) {
      remaps.push({ oldId: user.id as string, newId: newId.trim(), email: label as string });
      console.log(`  ✓ Will remap: ${user.id} → ${newId.trim()}\n`);
    } else {
      console.log(`  — Skipping ${label}\n`);
    }
  }

  rl.close();

  if (remaps.length === 0) {
    console.log("\nNo remaps to perform. Exiting.");
    return;
  }

  // Confirm
  console.log("\n--- Summary ---");
  for (const r of remaps) {
    console.log(`  ${r.email}: ${r.oldId} → ${r.newId}`);
  }
  console.log("");

  // Execute remaps
  for (const remap of remaps) {
    try {
      await remapUser(remap.oldId, remap.newId, remap.email);
    } catch (err: any) {
      console.error(`\n  ✗ Failed for ${remap.email}:`, err.message || err);
      console.error(`    Stopping to prevent partial state. Fix the issue and re-run.`);
      process.exit(1);
    }
  }

  console.log("\n✅ All done! Your users' data is now linked to their production Clerk IDs.\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

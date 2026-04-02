// One-shot migration: adds snoozed_until column to tasks if it doesn't exist yet.
// Run with: npx tsx scripts/add-snoozed-until.ts

import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL!);

async function run() {
  await sql`
    ALTER TABLE tasks
    ADD COLUMN IF NOT EXISTS snoozed_until TIMESTAMPTZ
  `;
  console.log("✅ snoozed_until column added to tasks (or already existed).");
}

run().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});

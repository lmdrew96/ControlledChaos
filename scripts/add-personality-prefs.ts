// One-shot script: adds personality_prefs column to user_settings if it doesn't exist yet.
// Run with: npx tsx scripts/add-personality-prefs.ts

import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL!);

async function run() {
  await sql`
    ALTER TABLE user_settings
    ADD COLUMN IF NOT EXISTS personality_prefs jsonb
  `;
  console.log("✅ personality_prefs column added (or already existed).");
}

run().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});

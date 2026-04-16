/**
 * Check delivery status of friend nudge notifications.
 * Usage: npx tsx scripts/check-nudge-status.ts
 */

import { neon } from "@neondatabase/serverless";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const ASHLEY = "user_3B8FdpDoMfbmUVMPDPHLchsYW3G";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);

  const rows = await sql`
    SELECT payload->>'title' as title, send_after, sent_at
    FROM snoozed_pushes
    WHERE user_id = ${ASHLEY}
      AND payload->>'tag' LIKE 'friend-nudge-%'
    ORDER BY send_after
  `;

  console.log("\n  Ashley's Nudge Status\n  ─────────────────────\n");

  for (const r of rows) {
    const status = r.sent_at ? "✅ Delivered" : "⏳ Pending ";
    // send_after is stored as UTC in a bare timestamp column — Neon returns
    // it without a Z suffix, so Node interprets it as local time.  Force UTC
    // parsing, then format in ET.
    const raw = String(r.send_after);
    const utcDate = raw.endsWith("Z") ? new Date(raw) : new Date(raw + "Z");
    const day = utcDate.toLocaleDateString("en-US", {
      timeZone: "America/New_York",
      weekday: "short",
    });
    const time = utcDate.toLocaleTimeString("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      minute: "2-digit",
    });
    console.log(`  ${status}  ${day} ${time} ET  —  ${r.title}`);
  }

  const delivered = rows.filter((r) => r.sent_at).length;
  console.log(`\n  ${delivered}/${rows.length} delivered\n`);
}

main().catch(console.error);

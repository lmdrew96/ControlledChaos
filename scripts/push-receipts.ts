/**
 * Recent pushes: when the server sent each one vs. when each device got it.
 * Diagnoses iOS holding reminders (push_receipts, v2.97.6).
 * Usage: npx tsx scripts/push-receipts.ts [email] [days]
 *   defaults: lmdrew@udel.edu, 3 days. Times are America/New_York.
 *
 * Reading the gap:
 * - received ≈ sent but it showed up late → iOS held it on the phone.
 * - received ≈ the next push's sent → held before the phone (APNs, a
 *   sleeping push connection, restrictive Wi-Fi).
 * - no receipt row → the device never got it (or the beacon failed).
 */

import { neon } from "@neondatabase/serverless";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  const email = process.argv[2] ?? "lmdrew@udel.edu";
  const days = Number(process.argv[3] ?? 3);
  const sql = neon(process.env.DATABASE_URL!);

  const rows = await sql`
    SELECT to_char(n.sent_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York', 'MM-DD HH24:MI:SS') AS sent,
           to_char(r.received_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York', 'MM-DD HH24:MI:SS') AS received,
           CASE WHEN r.received_at IS NULL THEN NULL
                ELSE round(extract(epoch FROM r.received_at - n.sent_at))::int END AS gap_s,
           CASE WHEN r.user_agent ILIKE '%iphone%' THEN 'iPhone'
                WHEN r.user_agent ILIKE '%ipad%' THEN 'iPad'
                WHEN r.user_agent ILIKE '%android%' THEN 'Android'
                WHEN r.user_agent ILIKE '%mac os%' THEN 'Mac'
                WHEN r.user_agent IS NULL THEN NULL
                ELSE 'other' END AS device,
           left(n.content->>'title', 40) AS title
    FROM notifications n
    JOIN users u ON u.id = n.user_id
    LEFT JOIN push_receipts r ON r.notification_id = n.id
    WHERE u.email = ${email}
      AND n.type = 'push'
      AND n.sent_at > now() - make_interval(days => ${days})
    ORDER BY n.sent_at, r.received_at`;

  console.table(rows);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Shared FK-cascade logic for user-id rewrites.
 *
 * Used by:
 *   - scripts/remap-clerk-ids.ts (dev → prod Clerk id rotation)
 *   - scripts/dedupe-users-by-email.ts (collapsing duplicate user rows)
 *
 * When a new table that references users.id is added to the schema, also
 * add it here so both scripts pick it up automatically.
 */

import type { NeonQueryFunction } from "@neondatabase/serverless";

export type NeonClient = NeonQueryFunction<false, false>;

/**
 * Tables with a `user_id` column that references users.id.
 */
export const USER_CHILD_TABLES = [
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
] as const;

/**
 * Tables with non-standard user-reference columns (not named user_id).
 * Each entry is [table, column].
 */
export const USER_SPECIAL_COLUMNS: ReadonlyArray<readonly [string, string]> = [
  ["friendships", "requester_id"],
  ["friendships", "addressee_id"],
  ["nudges", "sender_id"],
  ["nudges", "recipient_id"],
];

export interface RepointOptions {
  /**
   * Tables from USER_CHILD_TABLES to leave untouched. Dedupe uses this to
   * skip user_settings — the canonical row already has its own settings
   * and the duplicate's get deleted outright instead of merged in.
   */
  skipTables?: readonly string[];
}

/**
 * Re-point every user_id reference from oldId to newId across all tracked
 * tables. The Neon serverless driver doesn't support transactions, so the
 * statements run sequentially; each is idempotent (already-pointed rows
 * match nothing on a re-run).
 */
export async function repointUserId(
  sql: NeonClient,
  oldId: string,
  newId: string,
  options: RepointOptions = {}
): Promise<void> {
  const skip = new Set(options.skipTables ?? []);

  for (const table of USER_CHILD_TABLES) {
    if (skip.has(table)) continue;
    await sql.query(
      `UPDATE "${table}" SET user_id = $1 WHERE user_id = $2`,
      [newId, oldId]
    );
  }

  for (const [table, column] of USER_SPECIAL_COLUMNS) {
    await sql.query(
      `UPDATE "${table}" SET "${column}" = $1 WHERE "${column}" = $2`,
      [newId, oldId]
    );
  }
}

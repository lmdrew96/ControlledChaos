import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("ERROR: DATABASE_URL environment variable is required.");
  process.exit(1);
}

const neonSql = neon(databaseUrl);

/**
 * Execute a parameterized SQL query.
 * Wraps the Neon tagged template function to accept regular string + params.
 */
export async function sql(
  query: string,
  params: unknown[] = []
): Promise<Record<string, unknown>[]> {
  return neonSql.query(query, params) as Promise<Record<string, unknown>[]>;
}

/**
 * Fetch the user's timezone from their preferences.
 * Falls back to America/New_York if not set.
 */
export async function getUserTimezone(userId: string): Promise<string> {
  const rows = await sql(
    `SELECT timezone FROM users WHERE id = $1 LIMIT 1`,
    [userId]
  );
  return (rows[0]?.timezone as string) || "America/New_York";
}

/**
 * Get the user ID from env. All queries are scoped to this user.
 * This is your Clerk user ID from the ControlledChaos app.
 */
export function getUserId(): string {
  const userId = process.env.CC_USER_ID;
  if (!userId) {
    throw new Error(
      "CC_USER_ID environment variable is required. " +
      "Set it to your Clerk user ID from ControlledChaos."
    );
  }
  return userId;
}

/**
 * The user's scheduling and display settings.
 *
 * `wakeTime`/`sleepTime` and `calendarStartHour`/`calendarEndHour` are two
 * DIFFERENT things and the app treats them differently — see the note on
 * `getUserSettings` below.
 */
export interface UserSchedulingSettings {
  timezone: string;
  wakeTime: number;
  sleepTime: number;
  calendarStartHour: number;
  calendarEndHour: number;
  weekStartDay: number;
}

/**
 * Load the settings a planner needs, applying the SAME fallbacks as the app's
 * /api/settings route — including the coupling where calendarStartHour falls
 * back to wakeTime (and calendarEndHour to sleepTime) when unset. Diverging
 * from that would have the model plan against different bounds than the app
 * draws and enforces.
 */
export async function getUserSettings(userId: string): Promise<UserSchedulingSettings> {
  const rows = await sql(
    `SELECT u.timezone,
            s.wake_time, s.sleep_time,
            s.calendar_start_hour, s.calendar_end_hour, s.week_start_day
       FROM users u
       LEFT JOIN user_settings s ON s.user_id = u.id
      WHERE u.id = $1
      LIMIT 1`,
    [userId]
  );

  const r = rows[0] ?? {};
  const wakeTime = (r.wake_time as number | null) ?? 7;
  const sleepTime = (r.sleep_time as number | null) ?? 22;

  return {
    timezone: (r.timezone as string) || "America/New_York",
    wakeTime,
    sleepTime,
    calendarStartHour: (r.calendar_start_hour as number | null) ?? wakeTime,
    calendarEndHour: (r.calendar_end_hour as number | null) ?? sleepTime,
    weekStartDay: (r.week_start_day as number | null) ?? 1,
  };
}

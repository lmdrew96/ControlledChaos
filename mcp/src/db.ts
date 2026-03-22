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

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

let instance: DrizzleDb | null = null;

/**
 * Build the client on first use, not on import.
 *
 * This used to read DATABASE_URL and throw at module scope. That made the
 * variable a *build-time* requirement: `next build` imports every route module
 * while collecting page data, each route pulls in db/queries, and the throw
 * failed the build before a single request existed.
 *
 * Vercel hid that by injecting env vars into its builds. Cloudflare Workers
 * does not — Worker secrets are runtime-only and a Workers Builds container
 * cannot see them — so the same code broke the CI build with "DATABASE_URL
 * environment variable is not set".
 *
 * Deferring to first query means the build needs no database, and a genuinely
 * missing URL still fails loudly, at the request that needed it.
 */
const getDb = (): DrizzleDb => {
  if (instance) return instance;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  instance = drizzle(neon(url), { schema });
  return instance;
};

/**
 * Stands in for the drizzle client so every existing `db.select()` call site
 * keeps working untouched. Methods are bound to the real instance so drizzle's
 * internal `this` (query builders, `db.transaction`) behaves normally.
 */
export const db = new Proxy({} as DrizzleDb, {
  get(_target, prop) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const value = real[prop];
    return typeof value === "function" ? value.bind(real) : value;
  },
  has(_target, prop) {
    return prop in (getDb() as unknown as object);
  },
});

export type Database = typeof db;

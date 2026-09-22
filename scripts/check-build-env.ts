/**
 * Fail the build when a NEXT_PUBLIC_* value the app cannot run without is
 * missing from the *build* environment.
 *
 * These are inlined into the client bundle by `next build`, so a missing one
 * cannot be corrected afterwards by setting a Worker secret — the literal is
 * already baked in (or baked out). Cloudflare Workers secrets are runtime-only
 * and a Workers Builds container cannot read them, so they have to be set as
 * build variables.
 *
 * This exists because a build without NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY once
 * deployed successfully and then 500'd every single request with
 * "@clerk/nextjs: Missing publishableKey" — clerkMiddleware throws on the
 * routing path, so there is no partial degradation, the whole site is down.
 * A failed build is strictly better than that, so this runs in prebuild.
 *
 * Local `next dev` is unaffected: it reads .env.local directly.
 */

type Requirement = {
  name: string;
  why: string;
  /** Substring the value must contain, when a wrong-environment value is a real risk. */
  expect?: { contains: string; describe: string };
};

const REQUIRED: Requirement[] = [
  {
    name: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    why: "clerkMiddleware throws on every request without it — the entire site 500s.",
    expect: {
      contains: "pk_live_",
      describe: "a production Clerk instance (pk_live_)",
    },
  },
  {
    name: "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
    why: "Inlined into the client bundle; without it push notifications silently never subscribe.",
  },
];

const isProductionBuild = process.env.NODE_ENV === "production";

const problems: string[] = [];

for (const req of REQUIRED) {
  const value = process.env[req.name];

  if (!value) {
    problems.push(`${req.name} is not set.\n      ${req.why}`);
    continue;
  }

  // Only enforce the environment shape on real production builds, so a local
  // `pnpm build` against .env.local (dev Clerk keys) still works.
  if (isProductionBuild && req.expect && !value.includes(req.expect.contains)) {
    problems.push(
      `${req.name} does not look like ${req.expect.describe}.\n` +
        `      ${req.why}`
    );
  }
}

if (problems.length > 0) {
  console.error(
    "\n  Build stopped: required build-time environment variables are missing.\n"
  );
  for (const p of problems) console.error(`    - ${p}\n`);
  console.error(
    "  These are NEXT_PUBLIC_* values, compiled into the browser bundle at\n" +
      "  build time. Setting them as Cloudflare Worker secrets does not help —\n" +
      "  secrets are runtime-only and the build container cannot read them.\n\n" +
      "  Cloudflare: Workers Builds -> Build configuration -> Variables\n" +
      "  Locally:    .env.local, or .env.production.local for prod values\n"
  );
  process.exit(1);
}

import type { NextConfig } from "next";
import path from "path";
import { execSync } from "child_process";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

/**
 * Baked into the client bundle at build time and served fresh by
 * /api/version. A tab compares the two to notice it is running stale JS.
 *
 * This has to change on EVERY deploy or the stale-tab update toast goes
 * quiet between version bumps. Vercel handed us VERCEL_GIT_COMMIT_SHA for
 * free; Workers does not, so the git SHA is read directly. Order:
 *   1. Workers Builds (CI) commit SHA
 *   2. local git — the normal path, since deploys run from a working copy
 *   3. Vercel, still live until the DNS cutover completes. Drop this once
 *      the Vercel project is removed.
 *   4. package version, for environments with no git (a bare tarball build)
 */
const gitSha = (): string | undefined => {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return undefined;
  }
};

const APP_VERSION =
  process.env.WORKERS_CI_COMMIT_SHA?.slice(0, 7) ??
  gitSha() ??
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ??
  process.env.npm_package_version ??
  "dev";

/**
 * Production defaults for the two NEXT_PUBLIC_* values the app cannot boot
 * without. Used only when the environment does not already supply them.
 *
 * These are PUBLIC. Next compiles every NEXT_PUBLIC_* value into the browser
 * bundle, so both are already served to every anonymous visitor on every page
 * load — you can read them out of the deployed HTML with curl. A Clerk
 * publishable key identifies the instance and authorizes nothing; a VAPID
 * public key cannot send a notification without its private half. The keys
 * that actually grant access — CLERK_SECRET_KEY, VAPID_PRIVATE_KEY,
 * DATABASE_URL and the rest — are Cloudflare Worker secrets and must never
 * appear in this repo.
 *
 * They are defaulted here because they are needed at BUILD time, and Worker
 * secrets are runtime-only: a Workers Builds container cannot read them. A
 * build that depended on dashboard configuration produced a Clerk-less bundle
 * that 500'd every request, because clerkMiddleware throws without a key.
 * Hardcoding the public half removes that failure mode entirely.
 *
 * `??` not `||`, and env-first, so .env.local still wins locally — development
 * keeps using the dev Clerk instance.
 */
const PUBLIC_PROD_DEFAULTS = {
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
    "pk_live_Y2xlcmsuY29udHJvbGxlZGNoYW9zLmFkaGRlc2lnbnMuZGV2JA",
  NEXT_PUBLIC_VAPID_PUBLIC_KEY:
    "BFh19eGyrda6wlLQ0JboKnN3zY0u4QTlw5NM6hDiZMix-l5yVlWJoqJp13b67jAIJ3s-uMpESkt2pWj1GC7d40Y",
} as const;

const nextConfig: NextConfig = {
  reactCompiler: true,
  env: {
    NEXT_PUBLIC_APP_VERSION: APP_VERSION,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
      PUBLIC_PROD_DEFAULTS.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    NEXT_PUBLIC_VAPID_PUBLIC_KEY:
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
      PUBLIC_PROD_DEFAULTS.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  },
  turbopack: {
    root: path.resolve(__dirname),
  },
  serverExternalPackages: ["node-ical", "@react-email/components", "resend", "web-push"],
  // `@react-email/render` ships separate node/browser/edge builds. Next traces
  // only the `node` one, but OpenNext bundles the server with the `workerd`
  // export condition, which points at `dist/edge` — untraced, so the bundle
  // step fails to resolve it. Force the edge build to be copied too; it is the
  // correct build for the Workers runtime anyway.
  outputFileTracingIncludes: {
    "**": ["./node_modules/.pnpm/@react-email+render@*/node_modules/@react-email/render/dist/edge/**"],
  },
  async redirects() {
    return [
      // Mirror → Daily Recap rename. Permanent redirect so existing
      // bookmarks, push-notification deep-links, etc. land in the right place.
      { source: "/mirror", destination: "/recap", permanent: true },
      { source: "/mirror/:path*", destination: "/recap/:path*", permanent: true },
      // Journal merged into the Brain Dump screen as a category toggle.
      { source: "/journal", destination: "/dump?category=junk_journal", permanent: true },
      // Momentum folded into a collapsible section on the dashboard.
      { source: "/momentum", destination: "/dashboard#momentum-panel", permanent: true },
    ];
  },
};

export default nextConfig;

// Lets `next dev` see Cloudflare bindings the same way the deployed Worker
// does. No-op today (there are no bindings) — here so adding one doesn't
// come with a dev/prod mismatch to debug.
initOpenNextCloudflareForDev();

import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * No incrementalCache override on purpose.
 *
 * ControlledChaos has no ISR surface — no `generateStaticParams`, no
 * `revalidate`, no `unstable_cache`. Every page is either static at build
 * time or rendered per-request behind Clerk auth. Wiring up the R2
 * incremental cache would mean provisioning a bucket and a binding to cache
 * nothing, so the default (no-op) cache stays.
 *
 * If ISR ever lands here, add r2IncrementalCache and a bucket binding.
 */
const config = defineCloudflareConfig();

/**
 * `pnpm build` is now the OpenNext build, so any CI that runs the conventional
 * build command produces `.open-next/` and the deploy step can find it.
 * Workers Builds failing with "Could not find compiled Open Next config" is
 * exactly that: a plain `next build` leaves only `.next/`.
 *
 * That makes the inner command explicit. OpenNext otherwise defaults to
 * `pnpm build`, which would now invoke itself forever.
 */
config.buildCommand = "pnpm next:build";

export default config;

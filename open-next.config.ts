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
export default defineCloudflareConfig();

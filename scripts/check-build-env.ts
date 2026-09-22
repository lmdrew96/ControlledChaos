/**
 * Guard against building production against the *development* Clerk instance.
 *
 * next.config.ts supplies public production defaults for the NEXT_PUBLIC_*
 * values the app cannot boot without, so "missing" is no longer a failure mode
 * worth checking — the build cannot produce a Clerk-less bundle any more.
 *
 * What remains possible is an override with the wrong environment's key. That
 * has already happened once: a Worker built from .env.local authenticated
 * against the dev Clerk instance, which has a separate user store, so an
 * existing fully-onboarded account arrived looking brand new and was offered
 * onboarding. Nothing was lost, but the deployed app was pointed at the wrong
 * users entirely, and it was not obvious from the outside.
 *
 * So: only complain when a value is explicitly set AND looks wrong. An unset
 * value is fine — next.config.ts handles it.
 */

const isProductionBuild =
  process.env.NODE_ENV === "production" ||
  // Workers Builds and most CI runners set this; local `pnpm build` does not.
  process.env.CI === "true" ||
  process.env.CI === "1";

const problems: string[] = [];

const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
if (isProductionBuild && clerkKey && clerkKey.startsWith("pk_test_")) {
  problems.push(
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is a pk_test_ key, which is the Clerk\n" +
      "      DEVELOPMENT instance. It has its own user store, so production\n" +
      "      accounts do not exist in it — users arrive looking brand new and\n" +
      "      get sent through onboarding. Production needs pk_live_."
  );
}

const clerkSecret = process.env.CLERK_SECRET_KEY;
if (isProductionBuild && clerkSecret && clerkSecret.startsWith("sk_test_")) {
  problems.push(
    "CLERK_SECRET_KEY is an sk_test_ key — the development instance. It must\n" +
      "      match the publishable key's environment or session verification\n" +
      "      fails against the wrong user store."
  );
}

if (problems.length > 0) {
  console.error("\n  Build stopped: wrong Clerk environment for a production build.\n");
  for (const p of problems) console.error(`    - ${p}\n`);
  console.error(
    "  Production values live in Cloudflare Worker secrets (runtime) and in\n" +
      "  next.config.ts (the public build-time defaults). .env.local holds the\n" +
      "  dev instance and should not be feeding a production build.\n"
  );
  process.exit(1);
}

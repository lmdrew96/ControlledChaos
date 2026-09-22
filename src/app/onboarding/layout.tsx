import type { ReactNode } from "react";

/**
 * Render onboarding at request time instead of prerendering it.
 *
 * The page is client-only and auth-gated — it calls useUser() on its first
 * line — so static generation buys nothing. It also breaks the build: when
 * NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is absent, Providers drops <ClerkProvider>
 * from the tree entirely (see providers.tsx), and prerendering this page then
 * fails with "useUser can only be used within the <ClerkProvider /> component".
 *
 * That made a browser-only credential into a build-time requirement, which
 * Vercel hid by injecting env into its builds and Cloudflare does not. Opting
 * the segment out of static export keeps `next build` independent of Clerk
 * configuration, the same way db/index.ts no longer needs DATABASE_URL.
 */
export const dynamic = "force-dynamic";

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

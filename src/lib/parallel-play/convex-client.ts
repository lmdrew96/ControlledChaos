import { ConvexReactClient } from "convex/react";

/**
 * Singleton Convex client for the browser. We instantiate it lazily so SSR
 * and unit tests don't fail when NEXT_PUBLIC_CONVEX_URL is unset.
 */
let cached: ConvexReactClient | null = null;

export function getConvexClient(): ConvexReactClient | null {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) return null;
  cached = new ConvexReactClient(url, {
    unsavedChangesWarning: false,
  });
  return cached;
}

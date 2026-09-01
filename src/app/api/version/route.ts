import { NextResponse } from "next/server";

// Never cached and never statically rendered: the whole point is that an old
// tab can ask what the CURRENT deploy is. A cached answer is the old answer.
export const dynamic = "force-dynamic";

/**
 * The version of the deployment serving this request.
 *
 * NEXT_PUBLIC_APP_VERSION is inlined at build time (see next.config.ts), so
 * this route — rebuilt with every deploy — reports the new version while a tab
 * opened before the deploy still holds the old one in its bundle. The
 * difference is what useAppVersion watches for.
 *
 * Deliberately unauthenticated: it leaks a short commit SHA and nothing else,
 * and a stale tab whose Clerk session has expired still needs an answer.
 */
export function GET() {
  return NextResponse.json(
    { version: process.env.NEXT_PUBLIC_APP_VERSION ?? "dev" },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}

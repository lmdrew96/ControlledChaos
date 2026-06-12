import { NextResponse } from "next/server";

/**
 * GET — return the public VAPID key.
 *
 * public/sw.js is a static file and can't read build-time env vars, so when it
 * handles `pushsubscriptionchange` (a subscription rotation) it fetches the key
 * here to re-subscribe. The key is public by design, so no auth and a long
 * cache are both fine.
 */
export async function GET() {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "VAPID key not configured" },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { key },
    { headers: { "Cache-Control": "public, max-age=86400" } }
  );
}

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed token carried in each push so the service worker can report when it
 * arrived (/api/notifications/receipt). Same scheme as snooze-token.ts: the
 * endpoint is public, so it trusts only what this token names.
 */
export interface ReceiptClaims {
  userId: string;
  notificationId: string;
  subscriptionId: string;
}

/** A held push can arrive well after it was sent; that's the point. */
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function sign(data: string): string {
  const secret = process.env.VAPID_PRIVATE_KEY;
  if (!secret) throw new Error("VAPID_PRIVATE_KEY is not set");
  return createHmac("sha256", secret).update(`cc-receipt:${data}`).digest("base64url");
}

export function mintReceiptToken(claims: ReceiptClaims, now = Date.now()): string {
  const data = Buffer.from(
    JSON.stringify({
      u: claims.userId,
      n: claims.notificationId,
      s: claims.subscriptionId,
      exp: now + TOKEN_TTL_MS,
    })
  ).toString("base64url");
  return `${data}.${sign(data)}`;
}

/** The claims if the token is authentic and unexpired, else null. */
export function verifyReceiptToken(token: string, now = Date.now()): ReceiptClaims | null {
  const [data, sig, extra] = token.split(".");
  if (!data || !sig || extra !== undefined) return null;
  const given = Buffer.from(sig);
  const expected = Buffer.from(sign(data));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const c = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as {
      u?: unknown; n?: unknown; s?: unknown; exp?: unknown;
    };
    if (
      typeof c.u !== "string" ||
      typeof c.n !== "string" ||
      typeof c.s !== "string" ||
      typeof c.exp !== "number"
    ) {
      return null;
    }
    if (c.exp < now) return null;
    return { userId: c.u, notificationId: c.n, subscriptionId: c.s };
  } catch {
    return null;
  }
}

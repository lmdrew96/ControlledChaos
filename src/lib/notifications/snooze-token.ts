import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed token carried in a push's data so the service worker can snooze it
 * without a Clerk session. /api/notifications/snooze is public and trusts
 * only what this token says — never a userId or copy from the request body,
 * or anyone could queue pushes to anyone.
 *
 * Signed with VAPID_PRIVATE_KEY (domain-separated): it's already a
 * server-only secret wherever pushes can be sent, so no new env var.
 */
export interface SnoozeClaims {
  userId: string;
  taskId: string;
  tag?: string;
}

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function sign(data: string): string {
  const secret = process.env.VAPID_PRIVATE_KEY;
  if (!secret) throw new Error("VAPID_PRIVATE_KEY is not set");
  return createHmac("sha256", secret).update(`cc-snooze:${data}`).digest("base64url");
}

export function mintSnoozeToken(claims: SnoozeClaims, now = Date.now()): string {
  const data = Buffer.from(
    JSON.stringify({ u: claims.userId, k: claims.taskId, g: claims.tag, exp: now + TOKEN_TTL_MS })
  ).toString("base64url");
  return `${data}.${sign(data)}`;
}

/** The claims if the token is authentic and unexpired, else null. */
export function verifySnoozeToken(token: string, now = Date.now()): SnoozeClaims | null {
  const [data, sig, extra] = token.split(".");
  if (!data || !sig || extra !== undefined) return null;
  const given = Buffer.from(sig);
  const expected = Buffer.from(sign(data));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const c = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as {
      u?: unknown; k?: unknown; g?: unknown; exp?: unknown;
    };
    if (typeof c.u !== "string" || typeof c.k !== "string" || typeof c.exp !== "number") return null;
    if (c.exp < now) return null;
    return { userId: c.u, taskId: c.k, tag: typeof c.g === "string" ? c.g : undefined };
  } catch {
    return null;
  }
}

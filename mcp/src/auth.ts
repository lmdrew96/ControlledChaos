import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Per-user connector tokens for the hosted MCP endpoint.
 *
 * A token is `<userId>.<sig>`, where sig = HMAC-SHA256(MCP_TOKEN_SECRET, userId).
 * The userId half is not secret — the signature is what grants access, so
 * knowing someone's Clerk id is no longer enough. No DB table: rotating
 * MCP_TOKEN_SECRET revokes every token at once.
 */

const sign = (userId: string, secret: string): string =>
  createHmac("sha256", secret).update(`cc-mcp:${userId}`).digest("base64url");

export function mintToken(userId: string, secret: string): string {
  return `${userId}.${sign(userId, secret)}`;
}

/** Returns the userId the token was minted for, or null if it doesn't verify. */
export function verifyToken(token: string, secret: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const userId = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(userId, secret));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return null;
  }
  return userId;
}

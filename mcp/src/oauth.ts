import { createClerkClient } from "@clerk/backend";
import {
  fetchClerkAuthorizationServerMetadata,
  generateClerkProtectedResourceMetadata,
} from "@clerk/mcp-tools/server";

/**
 * Sign-in for the hosted `/mcp` endpoint, with Clerk as the OAuth server.
 *
 * The MCP client (claude.ai, ChatGPT, Claude Code…) gets a 401 pointing at
 * our protected-resource metadata, which names the ControlledChaos Clerk
 * instance as the authorization server. The person signs in there with their
 * normal ControlledChaos account and the client sends the resulting OAuth
 * access token as a Bearer token. Clerk's Backend API tells us whose it is.
 */

interface ClerkKeys {
  secretKey: string;
  publishableKey: string;
}

/** Both Clerk keys, or null when the deployment hasn't been given them. */
export const getClerkKeys = (): ClerkKeys | null => {
  const secretKey = process.env.CLERK_SECRET_KEY;
  const publishableKey = process.env.CLERK_PUBLISHABLE_KEY;
  if (!secretKey || !publishableKey) return null;
  return { secretKey, publishableKey };
};

/** The public origin of this deployment, as the client reached it. */
export const requestOrigin = (headers: Record<string, string | string[] | undefined>): string => {
  const host = headers["x-forwarded-host"] ?? headers.host;
  return `https://${Array.isArray(host) ? host[0] : host}`;
};

export const resourceMetadataUrl = (origin: string): string =>
  `${origin}/.well-known/oauth-protected-resource/mcp`;

export const protectedResourceMetadata = (
  keys: ClerkKeys,
  origin: string
): Record<string, unknown> =>
  generateClerkProtectedResourceMetadata({
    publishableKey: keys.publishableKey,
    resourceUrl: `${origin}/mcp`,
    properties: {
      scopes_supported: ["profile", "email"],
      resource_name: "ControlledChaos",
    },
  });

export const authorizationServerMetadata = (keys: ClerkKeys): Promise<unknown> =>
  fetchClerkAuthorizationServerMetadata({ publishableKey: keys.publishableKey });

/**
 * The Clerk user id a Bearer access token belongs to, or null if Clerk
 * rejects it (unknown, expired, revoked). Network or Clerk outages throw, so
 * the caller can answer 5xx instead of telling a signed-in user to sign in again.
 */
export const verifyAccessToken = async (
  keys: ClerkKeys,
  accessToken: string
): Promise<string | null> => {
  const clerk = createClerkClient(keys);
  try {
    const token = await clerk.idPOAuthAccessToken.verify(accessToken);
    if (token.revoked || token.expired || !token.subject) return null;
    return token.subject;
  } catch (error) {
    // 4xx from Clerk = this token is no good. Anything else is ours to surface.
    const status = (error as { status?: number }).status;
    if (status !== undefined && status >= 400 && status < 500) return null;
    throw error;
  }
};

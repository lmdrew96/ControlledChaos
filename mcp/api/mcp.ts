import {
  getClerkKeys,
  requestOrigin,
  resourceMetadataUrl,
  verifyAccessToken,
} from "../src/oauth.js";
import { serveMcp } from "../src/serve.js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * The sign-in connector endpoint: `/mcp`, authorized by a Clerk OAuth access
 * token. Everyone uses this same URL; the token says who they are.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Browser-based MCP clients need CORS, and must be able to read the 401's
  // WWW-Authenticate header to find the sign-in metadata.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, Mcp-Protocol-Version, Mcp-Session-Id"
  );
  res.setHeader("Access-Control-Expose-Headers", "WWW-Authenticate");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const keys = getClerkKeys();
  if (!keys) {
    console.error("[MCP] CLERK_SECRET_KEY / CLERK_PUBLISHABLE_KEY not set; refusing /mcp");
    res.status(500).json({ error: "Server is not configured" });
    return;
  }

  const header = req.headers.authorization ?? "";
  const accessToken = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

  let userId: string | null = null;
  if (accessToken) {
    try {
      userId = await verifyAccessToken(keys, accessToken);
    } catch (error) {
      console.error("[MCP] Clerk token verification failed:", error);
      res.status(502).json({ error: "Could not verify sign-in right now" });
      return;
    }
  }

  if (!userId) {
    const metadata = resourceMetadataUrl(requestOrigin(req.headers));
    res.setHeader(
      "WWW-Authenticate",
      accessToken
        ? `Bearer error="invalid_token", resource_metadata="${metadata}"`
        : `Bearer resource_metadata="${metadata}"`
    );
    res.status(401).json({ error: "Sign in to ControlledChaos to connect" });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  await serveMcp(userId, req, res, req.body);
}

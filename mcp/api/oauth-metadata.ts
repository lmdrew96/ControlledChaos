import { corsHeaders } from "@clerk/mcp-tools/server";
import {
  authorizationServerMetadata,
  getClerkKeys,
  protectedResourceMetadata,
  requestOrigin,
} from "../src/oauth.js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * The public OAuth discovery documents MCP clients read before sign-in
 * (vercel.json routes the `/.well-known/...` paths here):
 *
 * - `?doc=resource` → protected-resource metadata (RFC 9728), naming the
 *   ControlledChaos Clerk instance as the authorization server.
 * - `?doc=server` → Clerk's own authorization-server metadata, mirrored for
 *   older clients that look for it on the MCP server's origin.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  for (const [name, value] of Object.entries(corsHeaders)) res.setHeader(name, value);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const keys = getClerkKeys();
  if (!keys) {
    console.error("[MCP] CLERK_SECRET_KEY / CLERK_PUBLISHABLE_KEY not set; no OAuth metadata");
    res.status(500).json({ error: "Server is not configured" });
    return;
  }

  if (req.query.doc === "server") {
    try {
      res.json(await authorizationServerMetadata(keys));
    } catch (error) {
      console.error("[MCP] Fetching Clerk authorization-server metadata failed:", error);
      res.status(502).json({ error: "Could not reach the sign-in server" });
    }
    return;
  }

  res.json(protectedResourceMetadata(keys, requestOrigin(req.headers)));
}

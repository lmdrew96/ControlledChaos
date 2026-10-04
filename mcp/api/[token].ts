import { verifyToken } from "../src/auth.js";
import { serveMcp } from "../src/serve.js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * Legacy connector URLs (`/<signed token>`), hand-minted with `pnpm mint-url`.
 * Kept so existing connections don't break; new ones sign in at `/mcp`.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const secret = process.env.MCP_TOKEN_SECRET;
  if (!secret) {
    console.error("[MCP] MCP_TOKEN_SECRET is not set; refusing all requests");
    res.status(500).json({ error: "Server is not configured" });
    return;
  }

  const token = req.query.token;
  const userId = typeof token === "string" ? verifyToken(token, secret) : null;
  if (!userId) {
    res.status(401).json({ error: "Invalid or missing connector token" });
    return;
  }

  if (req.method === "GET") {
    res.json({ status: "ok", server: "controlledchaos-mcp-server" });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  await serveMcp(userId, req, res, req.body);
}

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerAllTools } from "../src/tools.js";
import { verifyToken } from "../src/auth.js";
import { runAsUser } from "../src/db.js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

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

  // Scope this request's tool calls to its user. Per-request context, not
  // process.env: concurrent requests can share one function instance.
  await runAsUser(userId, async () => {
    const server = new McpServer({
      name: "controlledchaos-mcp-server",
      version: "1.0.0",
    });

    registerAllTools(server);

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    res.on("close", () => transport.close());
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });
}

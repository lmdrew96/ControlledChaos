import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerAllTools } from "../src/tools.js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const userId = req.query.userId as string;

  if (!userId || typeof userId !== "string") {
    res.status(400).json({ error: "Missing user ID in URL path" });
    return;
  }

  // Make the user ID available to tool handlers via process.env
  // (safe — each Vercel invocation is isolated)
  process.env.CC_USER_ID = userId;

  if (req.method === "GET") {
    res.json({ status: "ok", server: "controlledchaos-mcp-server", userId });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

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
}

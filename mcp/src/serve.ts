import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import { registerAllTools } from "./tools.js";
import { runAsUser } from "./db.js";

/**
 * Answer one hosted MCP request as `userId`. Both hosted entry points use it:
 * `/mcp` (Clerk OAuth sign-in) and the legacy `/<token>` connector URLs.
 */
export const serveMcp = (
  userId: string,
  req: IncomingMessage,
  res: ServerResponse,
  body: unknown
): Promise<void> =>
  // Scope this request's tool calls to its user. Per-request context, not
  // process.env: concurrent requests can share one function instance.
  runAsUser(userId, async () => {
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
    await transport.handleRequest(req, res, body);
  });

import { mintToken } from "./auth.js";

// Prints the connector URL for one user. Run with the same MCP_TOKEN_SECRET
// the deployed server has:
//   MCP_TOKEN_SECRET=… pnpm mint-url <clerk-user-id> <deployment-base-url>
const secret = process.env.MCP_TOKEN_SECRET;
const [userId, baseUrl] = process.argv.slice(2);

if (!secret || !userId || !baseUrl) {
  console.error("Usage: MCP_TOKEN_SECRET=… pnpm mint-url <clerk-user-id> <deployment-base-url>");
  process.exit(1);
}

console.log(`${baseUrl.replace(/\/$/, "")}/${mintToken(userId, secret)}`);

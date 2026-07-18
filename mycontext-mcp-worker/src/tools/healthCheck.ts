import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MCP_SCOPE } from "../constants.js";
import { checkHealth, type TidbClient } from "../tidb.js";

export function registerHealthCheckTool(server: McpServer, client: TidbClient): void {
  server.registerTool(
    "health_check",
    {
      title: "Check mycontext health",
      description: "Return non-secret TiDB health plus document, business-section, and author-style counts.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      },
      _meta: { securitySchemes: [{ type: "oauth2", scopes: [MCP_SCOPE] }] }
    },
    async () => {
      const output = await checkHealth(client);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
        structuredContent: output
      };
    }
  );
}

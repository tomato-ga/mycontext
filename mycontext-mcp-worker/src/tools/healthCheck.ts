import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { checkHealth, type TidbClient } from "../tidb.js";

export function registerHealthCheckTool(server: McpServer, client: TidbClient): void {
  server.registerTool(
    "health_check",
    {
      description: "Return non-secret health information for the configured read-only TiDB context source."
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

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MCP_SCOPE } from "../constants.js";
import { listDocuments, type TidbClient } from "../tidb.js";

export function registerListDocumentsTool(server: McpServer, client: TidbClient): void {
  server.registerTool(
    "list_documents",
    {
      title: "List synced documents",
      description:
        "List synced Notion, editor knowledge, and business knowledge documents available in TiDB.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      },
      _meta: { securitySchemes: [{ type: "oauth2", scopes: [MCP_SCOPE] }] }
    },
    async () => {
      const documents = await listDocuments(client);
      const output = { documents };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
        structuredContent: output
      };
    }
  );
}

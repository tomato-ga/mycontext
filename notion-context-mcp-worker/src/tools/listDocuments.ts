import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { listDocuments, type TidbClient } from "../tidb.js";

export function registerListDocumentsTool(server: McpServer, client: TidbClient): void {
  server.registerTool(
    "list_documents",
    {
      description: "List synced Notion pages available in TiDB."
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

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MCP_SCOPE } from "../constants.js";
import { searchText, TopKValidationError, validateTopK, type TidbClient } from "../tidb.js";
import { buildSearchToolResult } from "./searchResult.js";

const inputSchema = {
  query: z.string().trim().min(1).max(1_000),
  topK: z.number().optional()
};

export function registerSearchTextTool(server: McpServer, client: TidbClient): void {
  server.registerTool(
    "search_text",
    {
      title: "Search document text",
      description:
        "LIKE-search alias across synced documents and semantic business-knowledge spans.",
      inputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      },
      _meta: { securitySchemes: [{ type: "oauth2", scopes: [MCP_SCOPE] }] }
    },
    async ({ query, topK }) => {
      let limitedTopK: number;
      try {
        limitedTopK = validateTopK(topK ?? 5);
      } catch (error) {
        if (error instanceof TopKValidationError) {
          return {
            isError: true,
            content: [{ type: "text" as const, text: error.message }]
          };
        }
        throw error;
      }

      const hits = await searchText(client, query, limitedTopK);
      return buildSearchToolResult(hits);
    }
  );
}

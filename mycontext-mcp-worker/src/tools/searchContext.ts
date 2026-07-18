import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MCP_SCOPE } from "../constants.js";
import { searchContext, TopKValidationError, validateTopK } from "../tidb.js";
import type { TidbClient } from "../tidb.js";
import { buildSearchToolResult } from "./searchResult.js";

const inputSchema = {
  query: z.string().trim().min(1).max(1_000),
  topK: z.number().optional()
};

export function registerSearchContextTool(
  server: McpServer,
  client: TidbClient
): void {
  server.registerTool(
    "search_context",
    {
      title: "Search synced context",
      description:
        "Search synced Notion/editor Markdown and semantic business-knowledge spans. Business hits return the complete delivery section.",
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

      const hits = await searchContext(client, query, limitedTopK);
      return buildSearchToolResult(hits);
    }
  );
}

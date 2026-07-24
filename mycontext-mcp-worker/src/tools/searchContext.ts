import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MCP_SCOPE } from "../constants.js";
import { EMPTY_PERSONAL_SYNONYM_CONFIG, type PersonalSynonymConfig } from "../searchQuery.js";
import { searchContext, TopKValidationError, validateTopK } from "../tidb.js";
import type { TidbClient } from "../tidb.js";
import { buildSearchToolResult } from "./searchResult.js";

const inputSchema = {
  query: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .describe(
      "Pass the user's full Japanese question unchanged. The server performs phrase, keyword, ranking, and synonym fallback search."
    ),
  topK: z
    .number()
    .int()
    .min(1)
    .max(5)
    .default(3)
    .describe("Number of compact candidates to return. Use 3 unless the user asks for broader coverage.")
};

export function registerSearchContextTool(
  server: McpServer,
  client: TidbClient,
  personalSynonyms: PersonalSynonymConfig = EMPTY_PERSONAL_SYNONYM_CONFIG
): void {
  server.registerTool(
    "search_personal_context",
    {
      title: "Search personal context",
      description:
        "Search the user's synced personal context. Use this first for questions about the user's history, profile, skills, goals, preferences, business, editing, or AI work. Pass the full question without inventing an exact phrase. Returns compact candidates with stable IDs; call read_context with a returned ID when more detail is needed.",
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
        limitedTopK = validateTopK(topK, 5);
      } catch (error) {
        if (error instanceof TopKValidationError) {
          return {
            isError: true,
            content: [{ type: "text" as const, text: error.message }]
          };
        }
        throw error;
      }

      const startedAt = Date.now();
      const queryHash = await sha256(query);
      try {
        const hits = await searchContext(client, query, limitedTopK, personalSynonyms);
        console.log("mcp_tool", JSON.stringify({
          tool_name: "search_personal_context",
          query_length: query.length,
          query_hash: queryHash,
          result_count: hits.length,
          db_duration_ms: Date.now() - startedAt,
          total_duration_ms: Date.now() - startedAt,
          status_code: 200
        }));
        return buildSearchToolResult(hits);
      } catch (error) {
        console.error("mcp_tool_error", JSON.stringify({
          tool_name: "search_personal_context",
          query_length: query.length,
          query_hash: queryHash,
          result_count: 0,
          total_duration_ms: Date.now() - startedAt,
          status_code: 500,
          error_name: error instanceof Error ? error.name : "unknown"
        }));
        throw error;
      }
    }
  );
}

async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

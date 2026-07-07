import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { searchText, TopKValidationError, validateTopK, type TidbClient } from "../tidb.js";

const MAX_TEXT_LENGTH = 1_500;

const inputSchema = {
  query: z.string().trim().min(1).max(1_000),
  topK: z.number().optional()
};

export function registerSearchTextTool(server: McpServer, client: TidbClient): void {
  server.registerTool(
    "search_text",
    {
      description: "Plain-text LIKE search over full synced Notion page markdown.",
      inputSchema
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
      const results = hits.map((hit) => ({
        ...hit,
        text: excerpt(hit.text, hit.match_position, MAX_TEXT_LENGTH)
      }));
      const output = { results };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
        structuredContent: output
      };
    }
  );
}

function excerpt(text: string, matchPosition: number, maxLength: number): string {
  const index = Math.max(0, matchPosition - 1);
  const start = Math.max(0, index - Math.floor(maxLength / 3));
  const end = Math.min(text.length, start + maxLength);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < text.length ? "..." : "";
  return `${prefix}${text.slice(start, end)}${suffix}`;
}

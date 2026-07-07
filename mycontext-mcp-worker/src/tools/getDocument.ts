import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDocument, type TidbClient } from "../tidb.js";

const DEFAULT_MAX_CHARS = 30_000;
const MAX_MAX_CHARS = 80_000;

const inputSchema = {
  pageId: z.string().min(1).max(128),
  maxChars: z.number().int().min(1).max(MAX_MAX_CHARS).optional()
};

export function registerGetDocumentTool(server: McpServer, client: TidbClient): void {
  server.registerTool(
    "get_document",
    {
      description: "Return the full markdown body for one synced Notion page by pageId.",
      inputSchema
    },
    async ({ pageId, maxChars }) => {
      const document = await getDocument(client, pageId);
      if (document === null) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `document not found: ${pageId}` }]
        };
      }

      const limit = maxChars ?? DEFAULT_MAX_CHARS;
      const markdown = truncateText(document.markdown, limit);
      const output = {
        document: {
          ...document,
          markdown,
          truncated_output: markdown.length < document.markdown.length
        }
      };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
        structuredContent: output
      };
    }
  );
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength);
}

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it, vi } from "vitest";
import { registerGetDocumentTool } from "../src/tools/getDocument.js";
import type { TidbClient } from "../src/tidb.js";

describe("get_document business section compatibility", () => {
  it("returns a namespaced semantic section through the existing tool", async () => {
    const tidbClient: TidbClient = {
      execute: vi.fn().mockResolvedValue([{
        document_id: "startup-science",
        section_id: "detail-18",
        title: "18. Interview",
        heading_path_json: ["起業の科学", "18. Interview"],
        content_layer: "detail",
        section_markdown: "## 18. Interview\n\nFull parent section",
        source_line_start: 1241,
        source_line_end: 1300,
        related_source_path: null,
        freshness_class: "static_framework",
        source_kind: "book_summary",
        ingest_scope: "full_summary",
        source_declared_at: null,
        detail_available: null
      }])
    };
    const server = new McpServer({ name: "test-server", version: "1.0.0" });
    registerGetDocumentTool(server, tidbClient);
    const sdkClient = new Client({ name: "test-client", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await sdkClient.connect(clientTransport);
    try {
      const result = await sdkClient.callTool({
        name: "get_document",
        arguments: { sectionId: "business-knowledge:startup-science#detail-18" }
      });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({
        section: {
          section_id: "business-knowledge:startup-science#detail-18",
          document_id: "business-knowledge:startup-science",
          local_section_id: "detail-18",
          content_layer: "detail",
          markdown: "## 18. Interview\n\nFull parent section",
          source_kind: "book_summary",
          ingest_scope: "full_summary",
          source_declared_at: null,
          detail_available: null,
          resource_uri: "mycontext://business-knowledge/startup-science/sections/detail-18",
          truncated_output: false
        }
      });
      expect(result.content).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: "resource" }),
        expect.objectContaining({ type: "resource_link" })
      ]));
    } finally {
      await sdkClient.close();
      await server.close();
    }
  });
});

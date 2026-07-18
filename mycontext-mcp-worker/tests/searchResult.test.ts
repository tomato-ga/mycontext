import { describe, expect, it } from "vitest";
import { buildSearchToolResult } from "../src/tools/searchResult.js";

describe("buildSearchToolResult", () => {
  it("keeps existing document hits excerpted and returns a full business delivery section", () => {
    const longNotionText = `before-${"x".repeat(2_000)}-needle-after`;
    const deliveryMarkdown = "## Parent section\n\nThe complete semantic section.";
    const result = buildSearchToolResult([
      {
        document_id: "notion:page-1",
        source: "notion",
        title: "Profile",
        text: longNotionText,
        match_position: longNotionText.indexOf("needle") + 1
      },
      {
        document_id: "business-knowledge:startup-science",
        source: "business_knowledge",
        title: "起業の科学",
        text: deliveryMarkdown,
        match_position: 1,
        matched_span_position: 4,
        matched_section_id: "detail-18-interview",
        matched_section_title: "Interview",
        matched_content_layer: "detail",
        delivery_section_id: "detail-18",
        delivery_section_title: "Parent section",
        delivery_content_layer: "detail",
        heading_path: ["起業の科学", "Parent section", "Interview"],
        source_line_start: 10,
        source_line_end: 12,
        delivery_line_start: 8,
        delivery_line_end: 20,
        related_source_path: null,
        freshness_class: "static_framework",
        source_kind: "book_summary",
        ingest_scope: "full_summary",
        source_declared_at: null,
        detail_available: null,
        resource_uri: "mycontext://business-knowledge/startup-science/sections/detail-18"
      }
    ]);

    const structured = result.structuredContent as { results: Array<{ text: string }> };
    expect(structured.results[0].text.length).toBeLessThan(longNotionText.length);
    expect(structured.results[0].text).toContain("needle");
    expect(structured.results[1].text).toBe(deliveryMarkdown);
    expect(result.content).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "resource",
        resource: expect.objectContaining({
          uri: "mycontext://business-knowledge/startup-science/sections/detail-18",
          text: deliveryMarkdown,
          _meta: expect.objectContaining({
            matchedContentLayer: "detail",
            deliveryContentLayer: "detail",
            ingestScope: "full_summary",
            detailAvailable: null
          })
        })
      }),
      expect.objectContaining({
        type: "resource_link",
        uri: "mycontext://business-knowledge/startup-science/sections/detail-18"
      })
    ]));
  });
});

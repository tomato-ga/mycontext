import type { CallToolResult, ContentBlock } from "@modelcontextprotocol/sdk/types.js";
import type { SearchContextHit } from "../tidb.js";

const MAX_TEXT_LENGTH = 1_500;

export function buildSearchToolResult(hits: SearchContextHit[]): CallToolResult {
  const results = hits.map((hit) => ({
    ...hit,
    text: hit.source === "business_knowledge"
      ? hit.text
      : excerpt(hit.text, hit.match_position, MAX_TEXT_LENGTH)
  }));
  const output = { results };
  const content: ContentBlock[] = [{
    type: "text",
    text: JSON.stringify(output, null, 2)
  }];

  const emittedResources = new Set<string>();
  for (const result of results) {
    if (
      result.source !== "business_knowledge"
      || result.resource_uri === undefined
      || result.delivery_section_id === undefined
    ) {
      continue;
    }
    if (emittedResources.has(result.resource_uri)) {
      continue;
    }
    emittedResources.add(result.resource_uri);
    content.push(
      {
        type: "resource",
        resource: {
          uri: result.resource_uri,
          mimeType: "text/markdown",
          text: result.text,
          _meta: {
            matchedSectionId: result.matched_section_id,
            matchedContentLayer: result.matched_content_layer,
            deliverySectionId: result.delivery_section_id,
            deliveryContentLayer: result.delivery_content_layer,
            sourceKind: result.source_kind,
            ingestScope: result.ingest_scope,
            sourceDeclaredAt: result.source_declared_at,
            detailAvailable: result.detail_available,
            relatedSourcePath: result.related_source_path,
            freshnessClass: result.freshness_class
          }
        }
      },
      {
        type: "resource_link",
        uri: result.resource_uri,
        name: `${result.document_id}#${result.delivery_section_id}`,
        title: result.delivery_section_title,
        description: result.heading_path?.join(" > "),
        mimeType: "text/markdown",
        _meta: {
          sourceDeclaredAt: result.source_declared_at,
          ingestScope: result.ingest_scope,
          detailAvailable: result.detail_available,
          relatedSourcePath: result.related_source_path
        }
      }
    );
  }

  return { content, structuredContent: output };
}

export function excerpt(text: string, matchPosition: number, maxLength: number): string {
  const index = Math.max(0, matchPosition - 1);
  const start = Math.max(0, index - Math.floor(maxLength / 3));
  const end = Math.min(text.length, start + maxLength);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < text.length ? "..." : "";
  return `${prefix}${text.slice(start, end)}${suffix}`;
}

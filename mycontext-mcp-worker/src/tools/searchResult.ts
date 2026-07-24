import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { SearchContextHit } from "../tidb.js";

const MAX_SNIPPET_LENGTH = 600;

export function buildSearchToolResult(hits: SearchContextHit[]): CallToolResult {
  const results = hits.map((hit) => ({
    id: stableResultId(hit),
    title: hit.delivery_section_title ?? hit.title ?? hit.document_id,
    documentId: hit.document_id,
    source: hit.source,
    snippet: excerpt(hit.text, hit.match_position, MAX_SNIPPET_LENGTH),
    matchedTerms: hit.matched_terms,
    score: hit.score,
    searchStage: hit.search_stage
  }));
  const output = { results };
  const text = results.length === 0
    ? "No synced personal context matched this question."
    : [
        `Found ${results.length} personal-context result(s).`,
        ...results.map((result, index) => [
          `${index + 1}. ${result.title}`,
          `id: ${result.id}`,
          `matched: ${result.matchedTerms.join(", ") || "(fallback match)"}`,
          result.snippet
        ].join("\n"))
      ].join("\n\n");
  return {
    content: [{ type: "text", text }],
    structuredContent: output
  };
}

export function excerpt(text: string, matchPosition: number, maxLength: number): string {
  const index = Math.max(0, matchPosition - 1);
  const start = Math.max(0, index - Math.floor(maxLength / 3));
  const end = Math.min(text.length, start + maxLength);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < text.length ? "..." : "";
  return `${prefix}${text.slice(start, end)}${suffix}`;
}

function stableResultId(hit: SearchContextHit): string {
  if (hit.delivery_section_id !== undefined) {
    return `${hit.document_id}#${hit.delivery_section_id}`;
  }
  return hit.document_id;
}

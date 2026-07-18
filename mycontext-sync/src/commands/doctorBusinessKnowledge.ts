import { isDeepStrictEqual } from "node:util";
import {
  BUSINESS_KNOWLEDGE_SOURCES,
  businessKnowledgeSourceRootFromEnv,
  loadBusinessKnowledgeDocument
} from "../businessKnowledge.js";
import { sha256 } from "../hash.js";
import { createTidbClientFromEnv } from "../tidb.js";
import { errorMessage, type CliFlags } from "../types.js";

type DoctorStatus =
  | "ok"
  | "source_invalid"
  | "missing_tidb_document"
  | "document_mismatch"
  | "section_count_mismatch"
  | "section_mismatch";

export async function runDoctorBusinessKnowledge(_flags: CliFlags): Promise<void> {
  const sourceRoot = businessKnowledgeSourceRootFromEnv();
  const client = createTidbClientFromEnv();
  const results: Array<Record<string, unknown>> = [];

  try {
    await client.ping();
    for (const source of BUSINESS_KNOWLEDGE_SOURCES) {
      try {
        const local = await loadBusinessKnowledgeDocument(sourceRoot, source);
        const stored = await client.getBusinessKnowledgeDocument(source.documentId);
        if (stored === null) {
          results.push({
            documentId: source.documentId,
            status: "missing_tidb_document" satisfies DoctorStatus,
            expectedSections: local.sectionCount,
            expectedSearchSpans: local.searchSpanCount,
            warnings: []
          });
          continue;
        }

        const documentMatches = stored.title === local.title
          && stored.source_path_key === local.sourcePathKey
          && stored.source_kind === local.sourceKind
          && stored.ingest_scope === local.ingestScope
          && normalizeDate(stored.source_declared_at) === local.sourceDeclaredAt
          && Number(stored.source_bytes) === local.sourceBytes
          && Number(stored.source_line_count) === local.sourceLineCount
          && stored.markdown === local.markdown
          && stored.markdown_sha256 === local.markdownSha256
          && sha256(stored.markdown) === stored.markdown_sha256
          && stored.section_revision_sha256 === local.sectionRevisionSha256
          && stored.parser_version === local.parserVersion
          && stored.sectioning_version === local.sectioningVersion
          && Number(stored.section_count) === local.sectionCount
          && Number(stored.search_span_count) === local.searchSpanCount
          && jsonEquivalent(stored.outline_json, local.outline)
          && jsonEquivalent(stored.routing_metadata_json, local.routingMetadata);
        const rows = await client.listBusinessKnowledgeSections(
          source.documentId,
          local.sectionRevisionSha256
        );
        const localById = new Map(local.sections.map((section) => [section.sectionId, section]));
        const rowMatches = rows.every((row) => {
          const expected = localById.get(row.section_id);
          return expected !== undefined
            && row.section_revision_sha256 === expected.sectionRevisionSha256
            && row.parent_section_id === expected.parentSectionId
            && row.delivery_section_id === expected.deliverySectionId
            && row.section_type === expected.sectionType
            && nullableNumber(row.heading_level) === expected.headingLevel
            && row.section_number === expected.sectionNumber
            && row.title === expected.title
            && stringArrayEquivalent(row.heading_path_json, expected.headingPath)
            && row.content_layer === expected.contentLayer
            && Number(row.ordinal) === expected.ordinal
            && Number(row.source_line_start) === expected.sourceLineStart
            && Number(row.source_line_end) === expected.sourceLineEnd
            && row.direct_markdown === expected.directMarkdown
            && row.section_markdown === expected.sectionMarkdown
            && row.retrieval_text === expected.retrievalText
            && row.content_sha256 === expected.contentSha256
            && sha256(row.section_markdown) === row.content_sha256
            && booleanLike(row.is_searchable) === expected.isSearchable
            && row.related_source_path === expected.relatedSourcePath
            && row.freshness_class === expected.freshnessClass;
        });
        const status: DoctorStatus = !documentMatches
          ? "document_mismatch"
          : rows.length !== local.sectionCount
            ? "section_count_mismatch"
            : !rowMatches
              ? "section_mismatch"
              : "ok";
        results.push({
          documentId: source.documentId,
          title: local.title,
          status,
          markdownSha256: local.markdownSha256,
          sectionRevisionSha256: local.sectionRevisionSha256,
          expectedSections: local.sectionCount,
          storedSections: rows.length,
          expectedSearchSpans: local.searchSpanCount,
          storedSearchSpans: rows.filter((row) => booleanLike(row.is_searchable)).length,
          sourceMtimeMs: local.sourceMtimeMs,
          storedSourceMtimeMs: Number(stored.source_mtime_ms),
          sourceMtimeChangedWithoutContent:
            Number(stored.source_mtime_ms) !== local.sourceMtimeMs,
          warnings: []
        });
      } catch (error) {
        results.push({
          documentId: source.documentId,
          status: "source_invalid" satisfies DoctorStatus,
          warnings: [errorMessage(error)]
        });
      }
    }
  } finally {
    await client.close();
  }

  const failed = results.some((result) => result.status !== "ok");
  console.log(JSON.stringify({ status: failed ? "failed" : "ok", documents: results }, null, 2));
  if (failed) {
    process.exitCode = 2;
  }
}

function booleanLike(value: boolean | number): boolean {
  return value === true || value === 1;
}

function nullableNumber(value: number | null): number | null {
  return value === null ? null : Number(value);
}

function normalizeDate(value: Date | string | null): string | null {
  if (value === null) return null;
  if (value instanceof Date) {
    return [
      String(value.getFullYear()).padStart(4, "0"),
      String(value.getMonth() + 1).padStart(2, "0"),
      String(value.getDate()).padStart(2, "0")
    ].join("-");
  }
  return String(value).slice(0, 10);
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  return JSON.parse(value) as unknown;
}

function jsonEquivalent(actual: unknown, expected: unknown): boolean {
  return isDeepStrictEqual(parseJson(actual), expected);
}

function stringArrayEquivalent(actual: string | string[], expected: string[]): boolean {
  const parsed = parseJson(actual);
  return Array.isArray(parsed)
    && parsed.every((item) => typeof item === "string")
    && JSON.stringify(parsed) === JSON.stringify(expected);
}

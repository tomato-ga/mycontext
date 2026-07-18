import { isDeepStrictEqual } from "node:util";
import {
  METASKILL_SOURCE,
  loadMetaskillDocument,
  metaskillSourceRootFromEnv
} from "../metaskill.js";
import {
  buildMetaskillContext,
  enumerateMetaskillSelectors,
  parseMetaskillRoutingManifest
} from "../metaskillRouting.js";
import { sha256 } from "../hash.js";
import { createTidbClientFromEnv } from "../tidb.js";
import { errorMessage, type CliFlags } from "../types.js";

export async function runDoctorMetaskill(_flags: CliFlags): Promise<void> {
  const sourceRoot = metaskillSourceRootFromEnv();
  const client = createTidbClientFromEnv();
  let result: Record<string, unknown>;
  try {
    await client.ping();
    const local = await loadMetaskillDocument(sourceRoot, METASKILL_SOURCE);
    const storedDocument = await client.getMetaskillDocument(local.documentId);
    if (storedDocument === null || storedDocument.active_revision_sha256 === null) {
      result = {
        documentId: local.documentId,
        status: storedDocument === null ? "missing_tidb_document" : "missing_active_revision",
        warnings: []
      };
    } else {
      const storedRevision = await client.getMetaskillRevision(
        local.documentId,
        storedDocument.active_revision_sha256
      );
      const rows = await client.listMetaskillSections(
        local.documentId,
        storedDocument.active_revision_sha256
      );
      if (storedRevision === null) {
        result = {
          documentId: local.documentId,
          status: "missing_active_revision",
          warnings: []
        };
      } else {
        const documentMatches = storedDocument.collection_key === local.collectionKey
          && storedDocument.knowledge_scope === local.knowledgeScope
          && storedDocument.display_name === local.displayName
          && storedDocument.source_path_key === local.sourcePathKey
          && storedDocument.active_revision_sha256 === local.revisionSha256
          && storedDocument.status === "active";
        const revisionMatches = storedRevision.source_markdown === local.sourceMarkdown
          && storedRevision.source_markdown_sha256 === local.sourceMarkdownSha256
          && sha256(storedRevision.source_markdown) === storedRevision.source_markdown_sha256
          && Number(storedRevision.source_bytes) === local.sourceBytes
          && Number(storedRevision.source_line_count) === local.sourceLineCount
          && storedRevision.parser_version === local.parserVersion
          && storedRevision.sectioning_version === local.sectioningVersion
          && storedRevision.routing_version === local.routingVersion
          && jsonEquivalent(storedRevision.routing_manifest_json, local.routingManifest)
          && jsonEquivalent(storedRevision.outline_json, local.outline)
          && Number(storedRevision.section_count) === local.sectionCount
          && Number(storedRevision.delivery_section_count) === local.deliverySectionCount
          && Number(storedRevision.search_span_count) === local.searchSpanCount;
        const localById = new Map(local.sections.map((section) => [section.sectionId, section]));
        const sectionsMatch = rows.length === local.sections.length && rows.every((row) => {
          const expected = localById.get(row.section_id);
          return expected !== undefined
            && row.context_key === expected.contextKey
            && row.parent_section_id === expected.parentSectionId
            && row.delivery_section_id === expected.deliverySectionId
            && row.section_type === expected.sectionType
            && row.content_layer === expected.contentLayer
            && Number(row.context_priority) === expected.contextPriority
            && nullableNumber(row.heading_level) === expected.headingLevel
            && row.title === expected.title
            && jsonEquivalent(row.heading_path_json, expected.headingPath)
            && jsonEquivalent(row.aliases_json, expected.aliases)
            && Number(row.ordinal) === expected.ordinal
            && Number(row.source_line_start) === expected.sourceLineStart
            && Number(row.source_line_end) === expected.sourceLineEnd
            && Number(row.content_chars) === expected.contentChars
            && nullableNumber(row.estimated_tokens) === expected.estimatedTokens
            && row.direct_markdown === expected.directMarkdown
            && row.delivery_markdown === expected.deliveryMarkdown
            && row.retrieval_text === expected.retrievalText
            && row.content_sha256 === expected.contentSha256
            && sha256(row.direct_markdown) === row.content_sha256
            && booleanLike(row.is_searchable) === expected.isSearchable;
        });

        let routingStatus = "ok";
        let routingWarning: string | null = null;
        let routingCombinations = 0;
        let maximumContextChars = 0;
        try {
          const manifest = parseMetaskillRoutingManifest(local.routingManifest);
          const sectionMap = new Map(local.sections.flatMap((section) => section.contextKey === null
            ? []
            : [[section.contextKey, {
                contextKey: section.contextKey,
                title: section.title,
                markdown: section.deliveryMarkdown
              }] as const]));
          for (const selectors of enumerateMetaskillSelectors(manifest)) {
            const context = buildMetaskillContext({
              documentId: local.documentId,
              displayName: local.displayName,
              revisionSha256: local.revisionSha256,
              manifest,
              selectors,
              sections: sectionMap
            });
            routingCombinations += 1;
            maximumContextChars = Math.max(maximumContextChars, context.contextChars);
          }
        } catch (error) {
          routingStatus = "routing_invalid";
          routingWarning = errorMessage(error);
        }

        const status = !documentMatches
          ? "document_mismatch"
          : !revisionMatches
            ? "revision_mismatch"
            : !sectionsMatch
              ? "section_mismatch"
              : routingStatus;
        result = {
          documentId: local.documentId,
          displayName: local.displayName,
          status,
          sourceMarkdownSha256: local.sourceMarkdownSha256,
          activeRevisionSha256: storedDocument.active_revision_sha256,
          expectedSections: local.sectionCount,
          storedSections: rows.length,
          expectedDeliverySections: local.deliverySectionCount,
          storedDeliverySections: rows.filter((row) => row.section_type === "delivery").length,
          expectedSearchSpans: local.searchSpanCount,
          storedSearchSpans: rows.filter((row) => row.section_type === "search_span").length,
          routingCombinations,
          maximumContextChars,
          warnings: routingWarning === null ? [] : [routingWarning]
        };
      }
    }
  } catch (error) {
    result = { documentId: METASKILL_SOURCE.documentId, status: "source_invalid", warnings: [errorMessage(error)] };
  } finally {
    await client.close();
  }

  const failed = result.status !== "ok";
  console.log(JSON.stringify({ status: failed ? "failed" : "ok", document: result }, null, 2));
  if (failed) process.exitCode = 2;
}

function booleanLike(value: boolean | number): boolean {
  return value === true || value === 1;
}

function nullableNumber(value: number | string | null): number | null {
  return value === null ? null : Number(value);
}

function parseJson(value: unknown): unknown {
  return typeof value === "string" ? JSON.parse(value) as unknown : value;
}

function jsonEquivalent(actual: unknown, expected: unknown): boolean {
  return isDeepStrictEqual(parseJson(actual), expected);
}

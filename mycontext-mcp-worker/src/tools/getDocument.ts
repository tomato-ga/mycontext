import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  parseBusinessKnowledgeSectionReference,
  toBusinessKnowledgeDocumentId
} from "../businessKnowledge.js";
import { MCP_SCOPE } from "../constants.js";
import { getBusinessKnowledgeSection, getDocument, type TidbClient } from "../tidb.js";

const DEFAULT_MAX_CHARS = 30_000;
const MAX_MAX_CHARS = 80_000;

const inputSchema = {
  pageId: z.string().min(1).max(128).optional(),
  documentId: z
    .string()
    .min(1)
    .max(256)
    .regex(
      /^(notion|editor-knowledge|business-knowledge):.+$/,
      "documentId must use notion:, editor-knowledge:, or business-knowledge: namespace"
    )
    .optional(),
  sectionId: z
    .string()
    .min(1)
    .max(512)
    .regex(
      /^business-knowledge:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?#[A-Za-z0-9._~-]+$/,
      "sectionId must use business-knowledge:<document>#<section> format"
    )
    .optional(),
  maxChars: z.number().int().min(1).max(MAX_MAX_CHARS).optional()
};

export type GetDocumentTarget =
  | { kind: "document"; documentId: string }
  | { kind: "section"; reference: string; documentId: string; sectionId: string };

export function registerGetDocumentTool(server: McpServer, client: TidbClient): void {
  server.registerTool(
    "get_document",
    {
      title: "Get synced document",
      description:
        "Return one synced document or business-knowledge semantic section. Provide exactly one of legacy pageId, namespaced documentId, or sectionId.",
      inputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      },
      _meta: { securitySchemes: [{ type: "oauth2", scopes: [MCP_SCOPE] }] }
    },
    async ({ pageId, documentId, sectionId, maxChars }) => {
      const target = resolveGetDocumentTarget(pageId, documentId, sectionId);
      if (target === null) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: "exactly one of pageId, documentId, or sectionId is required"
          }]
        };
      }

      if (target.kind === "section") {
        const section = await getBusinessKnowledgeSection(
          client,
          target.documentId,
          target.sectionId
        );
        if (section === null) {
          return {
            isError: true,
            content: [{ type: "text" as const, text: `section not found: ${target.reference}` }]
          };
        }

        const limit = maxChars ?? DEFAULT_MAX_CHARS;
        const markdown = truncateText(section.markdown, limit);
        const output = {
          section: {
            section_id: target.reference,
            document_id: toBusinessKnowledgeDocumentId(section.document_id),
            local_section_id: section.section_id,
            title: section.title,
            heading_path: section.heading_path,
            content_layer: section.content_layer,
            markdown,
            source_line_start: section.source_line_start,
            source_line_end: section.source_line_end,
            related_source_path: section.related_source_path,
            freshness_class: section.freshness_class,
            source_kind: section.source_kind,
            ingest_scope: section.ingest_scope,
            source_declared_at: section.source_declared_at,
            detail_available: section.detail_available,
            resource_uri: section.resource_uri,
            truncated_output: markdown.length < section.markdown.length
          }
        };
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(output, null, 2) },
            {
              type: "resource" as const,
              resource: {
                uri: section.resource_uri,
                mimeType: "text/markdown",
                text: markdown,
                _meta: {
                  contentLayer: section.content_layer,
                  sourceKind: section.source_kind,
                  ingestScope: section.ingest_scope,
                  sourceDeclaredAt: section.source_declared_at,
                  detailAvailable: section.detail_available,
                  relatedSourcePath: section.related_source_path,
                  freshnessClass: section.freshness_class
                }
              }
            },
            {
              type: "resource_link" as const,
              uri: section.resource_uri,
              name: target.reference,
              title: section.title,
              description: section.heading_path.join(" > "),
              mimeType: "text/markdown",
              _meta: {
                sourceDeclaredAt: section.source_declared_at,
                ingestScope: section.ingest_scope,
                detailAvailable: section.detail_available,
                relatedSourcePath: section.related_source_path
              }
            }
          ],
          structuredContent: output
        };
      }

      const resolvedDocumentId = target.documentId;
      const document = await getDocument(client, resolvedDocumentId);
      if (document === null) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `document not found: ${resolvedDocumentId}` }]
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

export function resolveDocumentId(
  pageId: string | undefined,
  documentId: string | undefined
): string | null {
  if ((pageId === undefined) === (documentId === undefined)) {
    return null;
  }
  return pageId === undefined ? documentId ?? null : `notion:${pageId}`;
}

export function resolveGetDocumentTarget(
  pageId: string | undefined,
  documentId: string | undefined,
  sectionId: string | undefined
): GetDocumentTarget | null {
  const supplied = [pageId, documentId, sectionId].filter((value) => value !== undefined);
  if (supplied.length !== 1) {
    return null;
  }
  if (sectionId !== undefined) {
    const parsed = parseBusinessKnowledgeSectionReference(sectionId);
    return parsed === null
      ? null
      : {
          kind: "section",
          reference: sectionId,
          documentId: parsed.documentId,
          sectionId: parsed.sectionId
        };
  }
  const resolvedDocumentId = resolveDocumentId(pageId, documentId);
  return resolvedDocumentId === null
    ? null
    : { kind: "document", documentId: resolvedDocumentId };
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength);
}

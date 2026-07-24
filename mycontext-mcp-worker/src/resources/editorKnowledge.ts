import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { ResourceTemplate, type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  EDITOR_KNOWLEDGE_SECTIONED_DOCUMENT_IDS,
  buildEditorKnowledgeDocumentUri,
  buildEditorKnowledgeSectionUri,
  toEditorKnowledgeDocumentId,
  type EditorKnowledgeSectionedDocumentId
} from "../editorKnowledge.js";
import {
  getDocument,
  getEditorKnowledgeSection,
  listEditorKnowledgeResources,
  type TidbClient
} from "../tidb.js";

export const EDITOR_KNOWLEDGE_SECTION_URI_TEMPLATE =
  "mycontext://editor-knowledge/{documentId}/sections/{sectionId}";

const EDITOR_KNOWLEDGE_DOCUMENT_TITLES: Record<EditorKnowledgeSectionedDocumentId, string> = {
  "kikaku-composition-playbook": "企画構成プレイブック",
  "kikaku-db-catalog": "企画カタログ427"
};

export function registerEditorKnowledgeResources(server: McpServer, client: TidbClient): void {
  for (const documentId of EDITOR_KNOWLEDGE_SECTIONED_DOCUMENT_IDS) {
    const uri = buildEditorKnowledgeDocumentUri(documentId);
    server.registerResource(
      `editor-knowledge-${documentId}`,
      uri,
      {
        title: EDITOR_KNOWLEDGE_DOCUMENT_TITLES[documentId],
        description: "Full source Markdown retained for audit and section regeneration.",
        mimeType: "text/markdown"
      },
      async (requestedUri) => {
        const document = await getDocument(client, toEditorKnowledgeDocumentId(documentId));
        if (document === null || document.source !== "editor_knowledge") {
          throw resourceNotFound(requestedUri.toString());
        }
        return {
          contents: [{
            uri: requestedUri.toString(),
            mimeType: "text/markdown",
            text: document.markdown,
            _meta: {
              documentId,
              markdownSha256: document.markdown_sha256,
              sectionRevisionSha256: document.section_revision_sha256
            }
          }]
        };
      }
    );
  }

  const template = new ResourceTemplate(
    EDITOR_KNOWLEDGE_SECTION_URI_TEMPLATE,
    {
      list: async () => {
        const sections = await listEditorKnowledgeResources(client);
        return {
          resources: sections.map((section) => ({
            uri: section.resource_uri,
            name: `${section.document_id}#${section.section_id}`,
            title: section.title,
            description: section.heading_path.join(" > "),
            mimeType: "text/markdown",
            size: section.size_bytes,
            _meta: {
              contentLayer: section.content_layer,
              relatedSourcePath: section.related_source_path,
              freshnessClass: section.freshness_class
            }
          }))
        };
      }
    }
  );

  server.registerResource(
    "editor-knowledge-section",
    template,
    {
      title: "Editor knowledge section",
      description: "A semantic section of editor knowledge, addressable without loading the full source document.",
      mimeType: "text/markdown"
    },
    async (requestedUri, variables) => {
      const documentId = decodeVariable(variables.documentId, "documentId");
      const sectionId = decodeVariable(variables.sectionId, "sectionId");
      const expectedUri = buildEditorKnowledgeSectionUri(documentId, sectionId);
      if (requestedUri.toString() !== expectedUri) {
        throw resourceNotFound(requestedUri.toString());
      }

      const section = await getEditorKnowledgeSection(client, documentId, sectionId);
      if (section === null) {
        throw resourceNotFound(requestedUri.toString());
      }
      return {
        contents: [{
          uri: requestedUri.toString(),
          mimeType: "text/markdown",
          text: section.markdown,
          _meta: {
            documentId,
            sectionId,
            headingPath: section.heading_path,
            contentLayer: section.content_layer,
            sourceLineStart: section.source_line_start,
            sourceLineEnd: section.source_line_end,
            relatedSourcePath: section.related_source_path,
            freshnessClass: section.freshness_class
          }
        }]
      };
    }
  );
}

function decodeVariable(value: string | string[] | undefined, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new McpError(ErrorCode.InvalidParams, `Invalid editor knowledge resource ${name}`);
  }
  try {
    return decodeURIComponent(value);
  } catch {
    throw new McpError(ErrorCode.InvalidParams, `Invalid editor knowledge resource ${name}`);
  }
}

function resourceNotFound(uri: string): McpError {
  return new McpError(ErrorCode.InvalidParams, `Resource not found: ${uri}`);
}

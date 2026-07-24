import {
  EDITOR_KNOWLEDGE_SECTIONED_SOURCES,
  EDITOR_KNOWLEDGE_SOURCES,
  editorKnowledgeSourceRootFromEnv,
  loadEditorKnowledgeDocument,
  loadEditorKnowledgeSectionedDocument
} from "../editorKnowledge.js";
import { createTidbClientFromEnv } from "../tidb.js";
import { errorMessage, type CliFlags, type EditorKnowledgeDocumentId } from "../types.js";

type DoctorStatus =
  | "ok"
  | "source_invalid"
  | "missing_tidb_document"
  | "empty_markdown"
  | "hash_mismatch"
  | "title_mismatch";

type SectionedDoctorStatus =
  | "ok"
  | "source_invalid"
  | "missing_tidb_document"
  | "hash_mismatch"
  | "section_revision_mismatch"
  | "section_count_mismatch";

interface DoctorEditorKnowledgeResult {
  documentId: EditorKnowledgeDocumentId;
  title: string | null;
  status: DoctorStatus;
  sourceMarkdownSha256: string | null;
  tidbMarkdownSha256: string | null;
  markdownChars: number;
  warnings: string[];
}

interface DoctorEditorKnowledgeSectionedResult {
  documentId: string;
  title: string | null;
  status: SectionedDoctorStatus;
  sourceMarkdownSha256: string | null;
  tidbMarkdownSha256: string | null;
  expectedSections: number | null;
  storedSections: number | null;
  expectedSearchSpans: number | null;
  storedSearchSpans: number | null;
  warnings: string[];
}

export async function runDoctorEditorKnowledge(_flags: CliFlags): Promise<void> {
  const sourceRoot = editorKnowledgeSourceRootFromEnv();
  const client = createTidbClientFromEnv();
  const results: DoctorEditorKnowledgeResult[] = [];
  const sectionedResults: DoctorEditorKnowledgeSectionedResult[] = [];

  try {
    await client.ping();
    for (const source of EDITOR_KNOWLEDGE_SOURCES) {
      try {
        const local = await loadEditorKnowledgeDocument(sourceRoot, source);
        const row = await client.getEditorKnowledgeDocument(source.documentId);
        const status: DoctorStatus = row === null
          ? "missing_tidb_document"
          : row.markdown.length === 0
            ? "empty_markdown"
            : row.markdown_sha256 !== local.markdownSha256
              ? "hash_mismatch"
              : row.title !== local.title
                ? "title_mismatch"
                : "ok";
        results.push({
          documentId: source.documentId,
          title: local.title,
          status,
          sourceMarkdownSha256: local.markdownSha256,
          tidbMarkdownSha256: row?.markdown_sha256 ?? null,
          markdownChars: row?.markdown.length ?? 0,
          warnings: []
        });
      } catch (error) {
        results.push({
          documentId: source.documentId,
          title: null,
          status: "source_invalid",
          sourceMarkdownSha256: null,
          tidbMarkdownSha256: null,
          markdownChars: 0,
          warnings: [errorMessage(error)]
        });
      }
    }

    for (const source of EDITOR_KNOWLEDGE_SECTIONED_SOURCES) {
      try {
        const local = await loadEditorKnowledgeSectionedDocument(sourceRoot, source);
        const row = await client.getEditorKnowledgeDocument(source.documentId);
        const status: SectionedDoctorStatus = row === null
          ? "missing_tidb_document"
          : row.markdown_sha256 !== local.markdownSha256
            ? "hash_mismatch"
            : row.section_revision_sha256 !== local.sectionRevisionSha256
              ? "section_revision_mismatch"
              : row.section_count !== local.sectionCount || row.search_span_count !== local.searchSpanCount
                ? "section_count_mismatch"
                : "ok";
        sectionedResults.push({
          documentId: source.documentId,
          title: local.title,
          status,
          sourceMarkdownSha256: local.markdownSha256,
          tidbMarkdownSha256: row?.markdown_sha256 ?? null,
          expectedSections: local.sectionCount,
          storedSections: row?.section_count ?? null,
          expectedSearchSpans: local.searchSpanCount,
          storedSearchSpans: row?.search_span_count ?? null,
          warnings: []
        });
      } catch (error) {
        sectionedResults.push({
          documentId: source.documentId,
          title: null,
          status: "source_invalid",
          sourceMarkdownSha256: null,
          tidbMarkdownSha256: null,
          expectedSections: null,
          storedSections: null,
          expectedSearchSpans: null,
          storedSearchSpans: null,
          warnings: [errorMessage(error)]
        });
      }
    }
  } finally {
    await client.close();
  }

  const failed = results.some((result) => result.status !== "ok")
    || sectionedResults.some((result) => result.status !== "ok");
  console.log(JSON.stringify(
    { status: failed ? "failed" : "ok", documents: results, sectionedDocuments: sectionedResults },
    null,
    2
  ));
  if (failed) {
    process.exitCode = 2;
  }
}

import {
  loadEditorKnowledgeSectionedDocument,
  type EditorKnowledgeSectionedSource,
  type LoadedEditorKnowledgeSectionedDocument
} from "./editorKnowledge.js";
import { AppError, type PageSyncStatus } from "./types.js";

export interface EditorKnowledgeSectionedWriter {
  getEditorKnowledgeSectionedDocumentRevision(documentId: string): Promise<string | null>;
  upsertEditorKnowledgeSectionedDocumentAndSections(
    document: LoadedEditorKnowledgeSectionedDocument
  ): Promise<void>;
}

export interface EditorKnowledgeSectionedSyncResult {
  documentId: string;
  title: string | null;
  status: PageSyncStatus;
  markdownSha256: string;
  sectionRevisionSha256: string;
  sectionCount: number;
  searchSpanCount: number;
  dbIndexed: boolean;
  warnings: string[];
}

export interface SyncEditorKnowledgeSectionedOptions {
  sourceRoot: string;
  source: EditorKnowledgeSectionedSource;
  tidbClient: EditorKnowledgeSectionedWriter | null;
  dryRun: boolean;
  reindex: boolean;
}

export async function syncEditorKnowledgeSectionedDocument(
  options: SyncEditorKnowledgeSectionedOptions
): Promise<EditorKnowledgeSectionedSyncResult> {
  const document = await loadEditorKnowledgeSectionedDocument(options.sourceRoot, options.source);
  let dbIndexed = false;
  let dbSkipped = false;

  if (!options.dryRun) {
    if (!options.tidbClient) {
      throw new AppError("tidb_client_missing", "TiDB client is required", 3);
    }
    const activeRevision = await options.tidbClient.getEditorKnowledgeSectionedDocumentRevision(
      document.documentId
    );
    dbSkipped = !options.reindex && activeRevision === document.sectionRevisionSha256;
    if (!dbSkipped) {
      await options.tidbClient.upsertEditorKnowledgeSectionedDocumentAndSections(document);
      dbIndexed = true;
    }
  }

  return {
    documentId: document.documentId,
    title: document.title,
    status: options.dryRun ? "dry_run" : dbSkipped ? "skipped" : "synced",
    markdownSha256: document.markdownSha256,
    sectionRevisionSha256: document.sectionRevisionSha256,
    sectionCount: document.sectionCount,
    searchSpanCount: document.searchSpanCount,
    dbIndexed,
    warnings: []
  };
}

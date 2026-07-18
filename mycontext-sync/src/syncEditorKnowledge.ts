import type { EditorKnowledgeSource } from "./editorKnowledge.js";
import { loadEditorKnowledgeDocument } from "./editorKnowledge.js";
import { AppError, type EditorKnowledgeSyncResult } from "./types.js";

export interface EditorKnowledgeWriter {
  getEditorKnowledgeDocumentHash(documentId: string): Promise<string | null>;
  upsertEditorKnowledgeDocument(input: {
    documentId: string;
    title: string;
    markdown: string;
    markdownSha256: string;
  }): Promise<void>;
}

export interface SyncEditorKnowledgeOptions {
  sourceRoot: string;
  source: EditorKnowledgeSource;
  tidbClient: EditorKnowledgeWriter | null;
  dryRun: boolean;
  reindex: boolean;
}

export async function syncEditorKnowledgeDocument(
  options: SyncEditorKnowledgeOptions
): Promise<EditorKnowledgeSyncResult> {
  const document = await loadEditorKnowledgeDocument(options.sourceRoot, options.source);
  let dbIndexed = false;
  let dbSkipped = false;

  if (!options.dryRun) {
    if (!options.tidbClient) {
      throw new AppError("tidb_client_missing", "TiDB client is required", 3);
    }
    const activeHash = await options.tidbClient.getEditorKnowledgeDocumentHash(document.documentId);
    dbSkipped = !options.reindex && activeHash === document.markdownSha256;
    if (!dbSkipped) {
      await options.tidbClient.upsertEditorKnowledgeDocument(document);
      dbIndexed = true;
    }
  }

  return {
    documentId: document.documentId,
    title: document.title,
    status: options.dryRun ? "dry_run" : dbSkipped ? "skipped" : "synced",
    markdownSha256: document.markdownSha256,
    dbIndexed,
    warnings: []
  };
}

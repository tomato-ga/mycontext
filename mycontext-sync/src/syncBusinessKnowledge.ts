import {
  loadBusinessKnowledgeDocument,
  type BusinessKnowledgeSource,
  type LoadedBusinessKnowledgeDocument
} from "./businessKnowledge.js";
import { AppError, type PageSyncStatus } from "./types.js";

export interface BusinessKnowledgeWriter {
  getBusinessKnowledgeDocumentRevision(documentId: string): Promise<string | null>;
  upsertBusinessKnowledgeDocumentAndSections(
    document: LoadedBusinessKnowledgeDocument
  ): Promise<void>;
}

export interface BusinessKnowledgeSyncResult {
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

export interface SyncBusinessKnowledgeOptions {
  sourceRoot: string;
  source: BusinessKnowledgeSource;
  tidbClient: BusinessKnowledgeWriter | null;
  dryRun: boolean;
  reindex: boolean;
}

export async function syncBusinessKnowledgeDocument(
  options: SyncBusinessKnowledgeOptions
): Promise<BusinessKnowledgeSyncResult> {
  const document = await loadBusinessKnowledgeDocument(options.sourceRoot, options.source);
  let dbIndexed = false;
  let dbSkipped = false;

  if (!options.dryRun) {
    if (!options.tidbClient) {
      throw new AppError("tidb_client_missing", "TiDB client is required", 3);
    }
    const activeRevision = await options.tidbClient.getBusinessKnowledgeDocumentRevision(
      document.documentId
    );
    dbSkipped = !options.reindex && activeRevision === document.sectionRevisionSha256;
    if (!dbSkipped) {
      await options.tidbClient.upsertBusinessKnowledgeDocumentAndSections(document);
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

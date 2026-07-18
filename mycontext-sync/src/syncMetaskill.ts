import {
  loadMetaskillDocument,
  type LoadedMetaskillDocument,
  type MetaskillSource
} from "./metaskill.js";
import { AppError, type PageSyncStatus } from "./types.js";

export interface MetaskillWriter {
  getMetaskillDocumentRevision(documentId: string): Promise<string | null>;
  upsertMetaskillDocumentAndSections(document: LoadedMetaskillDocument): Promise<void>;
}

export interface MetaskillSyncResult {
  documentId: string;
  displayName: string | null;
  status: PageSyncStatus;
  sourceMarkdownSha256: string;
  revisionSha256: string;
  sectionCount: number;
  deliverySectionCount: number;
  searchSpanCount: number;
  dbIndexed: boolean;
  warnings: string[];
}

export async function syncMetaskillDocument(options: {
  sourceRoot: string;
  source: MetaskillSource;
  tidbClient: MetaskillWriter | null;
  dryRun: boolean;
  reindex: boolean;
}): Promise<MetaskillSyncResult> {
  const document = await loadMetaskillDocument(options.sourceRoot, options.source);
  let dbIndexed = false;
  let dbSkipped = false;

  if (!options.dryRun) {
    if (options.tidbClient === null) {
      throw new AppError("tidb_client_missing", "TiDB client is required", 3);
    }
    const activeRevision = await options.tidbClient.getMetaskillDocumentRevision(
      document.documentId
    );
    dbSkipped = !options.reindex && activeRevision === document.revisionSha256;
    if (!dbSkipped) {
      await options.tidbClient.upsertMetaskillDocumentAndSections(document);
      dbIndexed = true;
    }
  }

  return {
    documentId: document.documentId,
    displayName: document.displayName,
    status: options.dryRun ? "dry_run" : dbSkipped ? "skipped" : "synced",
    sourceMarkdownSha256: document.sourceMarkdownSha256,
    revisionSha256: document.revisionSha256,
    sectionCount: document.sectionCount,
    deliverySectionCount: document.deliverySectionCount,
    searchSpanCount: document.searchSpanCount,
    dbIndexed,
    warnings: []
  };
}

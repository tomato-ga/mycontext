import {
  EDITOR_KNOWLEDGE_SECTIONED_SOURCES,
  EDITOR_KNOWLEDGE_SOURCES,
  editorKnowledgeSourceRootFromEnv
} from "../editorKnowledge.js";
import { syncEditorKnowledgeDocument } from "../syncEditorKnowledge.js";
import { syncEditorKnowledgeSectionedDocument } from "../syncEditorKnowledgeSectioned.js";
import { createTidbClientFromEnv } from "../tidb.js";
import {
  AppError,
  errorMessage,
  type CliFlags,
  type EditorKnowledgeDocumentId,
  type EditorKnowledgeSyncResult
} from "../types.js";
import type { EditorKnowledgeSectionedSyncResult } from "../syncEditorKnowledgeSectioned.js";

export async function runPullEditorKnowledge(flags: CliFlags): Promise<void> {
  const sourceRoot = editorKnowledgeSourceRootFromEnv();
  const tidbClient = flags.dryRun ? null : createTidbClientFromEnv();
  const results: EditorKnowledgeSyncResult[] = [];
  const sectionedResults: EditorKnowledgeSectionedSyncResult[] = [];

  try {
    for (const source of EDITOR_KNOWLEDGE_SOURCES) {
      try {
        const result = await syncEditorKnowledgeDocument({
          sourceRoot,
          source,
          tidbClient,
          dryRun: flags.dryRun,
          reindex: flags.reindex
        });
        results.push(result);
        console.log(JSON.stringify(result));
      } catch (error) {
        const result = failedResult(source.documentId, error);
        results.push(result);
        console.log(JSON.stringify(result));
      }
    }

    for (const source of EDITOR_KNOWLEDGE_SECTIONED_SOURCES) {
      try {
        const result = await syncEditorKnowledgeSectionedDocument({
          sourceRoot,
          source,
          tidbClient,
          dryRun: flags.dryRun,
          reindex: flags.reindex
        });
        sectionedResults.push(result);
        console.log(JSON.stringify(result));
      } catch (error) {
        const result = failedSectionedResult(source.documentId, error);
        sectionedResults.push(result);
        console.log(JSON.stringify(result));
      }
    }
  } finally {
    await tidbClient?.close();
  }

  const allStatuses = [
    ...results.map((result) => result.status),
    ...sectionedResults.map((result) => result.status)
  ];
  const failedCount = allStatuses.filter((status) => status === "failed").length;
  console.log(
    JSON.stringify(
      {
        status: failedCount > 0 ? "failed" : "ok",
        documents_total: results.length + sectionedResults.length,
        documents_synced: countStatus(allStatuses, "synced"),
        documents_skipped: countStatus(allStatuses, "skipped"),
        documents_failed: failedCount,
        sectioned_sections_total: sectionedResults.reduce((sum, result) => sum + result.sectionCount, 0),
        sectioned_search_spans_total: sectionedResults.reduce(
          (sum, result) => sum + result.searchSpanCount,
          0
        )
      },
      null,
      2
    )
  );

  if (failedCount > 0) {
    throw new AppError("pull_editor_knowledge_failed", `${failedCount} document(s) failed`, 1);
  }
}

function failedResult(documentId: EditorKnowledgeDocumentId, error: unknown): EditorKnowledgeSyncResult {
  const appError = error instanceof AppError
    ? error
    : new AppError("editor_knowledge_sync_failed", errorMessage(error), 1, error);
  return {
    documentId,
    title: null,
    status: "failed",
    markdownSha256: "",
    dbIndexed: false,
    warnings: [`${appError.code}: ${appError.message}`]
  };
}

function failedSectionedResult(
  documentId: string,
  error: unknown
): EditorKnowledgeSectionedSyncResult {
  const appError = error instanceof AppError
    ? error
    : new AppError("editor_knowledge_sync_failed", errorMessage(error), 1, error);
  return {
    documentId,
    title: null,
    status: "failed",
    markdownSha256: "",
    sectionRevisionSha256: "",
    sectionCount: 0,
    searchSpanCount: 0,
    dbIndexed: false,
    warnings: [`${appError.code}: ${appError.message}`]
  };
}

function countStatus(
  statuses: EditorKnowledgeSyncResult["status"][],
  status: EditorKnowledgeSyncResult["status"]
): number {
  return statuses.filter((candidate) => candidate === status).length;
}

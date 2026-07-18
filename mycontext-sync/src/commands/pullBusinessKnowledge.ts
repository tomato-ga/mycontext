import {
  BUSINESS_KNOWLEDGE_SOURCES,
  businessKnowledgeSourceRootFromEnv
} from "../businessKnowledge.js";
import {
  syncBusinessKnowledgeDocument,
  type BusinessKnowledgeSyncResult
} from "../syncBusinessKnowledge.js";
import { createTidbClientFromEnv } from "../tidb.js";
import { AppError, errorMessage, type CliFlags } from "../types.js";

export async function runPullBusinessKnowledge(flags: CliFlags): Promise<void> {
  const sourceRoot = businessKnowledgeSourceRootFromEnv();
  const client = flags.dryRun ? null : createTidbClientFromEnv();
  const results: BusinessKnowledgeSyncResult[] = [];

  try {
    for (const source of BUSINESS_KNOWLEDGE_SOURCES) {
      try {
        const result = await syncBusinessKnowledgeDocument({
          sourceRoot,
          source,
          tidbClient: client,
          dryRun: flags.dryRun,
          reindex: flags.reindex
        });
        results.push(result);
        console.log(JSON.stringify(result));
      } catch (error) {
        const result: BusinessKnowledgeSyncResult = {
          documentId: source.documentId,
          title: null,
          status: "failed",
          markdownSha256: "",
          sectionRevisionSha256: "",
          sectionCount: 0,
          searchSpanCount: 0,
          dbIndexed: false,
          warnings: [errorMessage(error)]
        };
        results.push(result);
        console.log(JSON.stringify(result));
      }
    }
  } finally {
    await client?.close();
  }

  const failedCount = results.filter((result) => result.status === "failed").length;
  console.log(JSON.stringify({
    status: failedCount === 0 ? "ok" : "failed",
    documents_total: results.length,
    documents_synced: results.filter((result) => result.status === "synced").length,
    documents_skipped: results.filter((result) => result.status === "skipped").length,
    documents_failed: failedCount,
    sections_total: results.reduce((sum, result) => sum + result.sectionCount, 0),
    search_spans_total: results.reduce((sum, result) => sum + result.searchSpanCount, 0)
  }, null, 2));

  if (failedCount > 0) {
    throw new AppError(
      "pull_business_knowledge_failed",
      `${failedCount} business knowledge document(s) failed`,
      1
    );
  }
}

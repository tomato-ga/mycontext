import { loadMirrorConfig } from "../config.js";
import { discoverPages } from "../discovery.js";
import { createNotionClientFromEnv } from "../notionClient.js";
import { syncPage } from "../syncPage.js";
import { createTidbClientFromEnv } from "../tidb.js";
import { AppError, errorMessage, toAppError, type CliFlags, type PageConfig, type SyncPageResult } from "../types.js";

export async function runPull(flags: CliFlags): Promise<void> {
  const config = await loadMirrorConfig(flags.config);
  const notionClient = createNotionClientFromEnv();
  const discovery = flags.pageId
    ? { pages: selectPages(config.pages, flags.pageId), discoveredCount: 0 }
    : await discoverPages(config.pages, notionClient);
  const pages = discovery.pages;
  const tidbClient = flags.dryRun ? null : createTidbClientFromEnv();
  const results: SyncPageResult[] = [];

  try {
    for (const page of pages) {
      try {
        const result = await syncPage({
          config,
          page,
          notionClient,
          tidbClient,
          dryRun: flags.dryRun,
          reindex: flags.reindex
        });
        results.push(result);
        console.log(JSON.stringify(result));
      } catch (error) {
        const failed = failedResult(page, error);
        results.push(failed);
        console.log(JSON.stringify(failed));
      }
    }
  } catch (error) {
    throw toAppError(error, "pull_failed", "pull failed", 1);
  } finally {
    await tidbClient?.close();
  }

  const failedCount = countStatus(results, "failed");
  console.log(
    JSON.stringify(
      {
        status: failedCount > 0 ? "failed" : "ok",
        pages_total: results.length,
        pages_discovered: discovery.discoveredCount,
        pages_failed: failedCount
      },
      null,
      2
    )
  );

  if (failedCount > 0) {
    throw new AppError("pull_failed", `${failedCount} page(s) failed`, 1);
  }
}

function selectPages(pages: PageConfig[], pageId?: string): PageConfig[] {
  if (!pageId) {
    return pages;
  }
  const page = pages.find((candidate) => candidate.pageId === pageId);
  if (!page) {
    throw new AppError("unknown_page_id", `pageId not found in config: ${pageId}`, 3);
  }
  return [page];
}

function failedResult(page: PageConfig, error: unknown): SyncPageResult {
  const appError = error instanceof AppError
    ? error
    : new AppError("page_sync_failed", errorMessage(error), 1, error);
  return {
    pageId: page.pageId,
    status: "failed",
    markdownSha256: "",
    dbIndexed: false,
    warnings: [`${appError.code}: ${appError.message}`]
  };
}

function countStatus(results: SyncPageResult[], status: SyncPageResult["status"]): number {
  return results.filter((result) => result.status === status).length;
}

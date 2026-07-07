import { computeSyncIdentifiers } from "./hash.js";
import type { NotionClient } from "./notionClient.js";
import type { TidbClient } from "./tidb.js";
import { AppError, type MirrorConfig, type PageConfig, type SyncPageResult } from "./types.js";

export interface SyncPageOptions {
  config: MirrorConfig;
  page: PageConfig;
  notionClient: NotionClient;
  tidbClient: TidbClient | null;
  dryRun: boolean;
  reindex: boolean;
}

export async function syncPage(options: SyncPageOptions): Promise<SyncPageResult> {
  const notion = await options.notionClient.fetchNotionMarkdown(options.page.pageId);
  const ids = computeSyncIdentifiers(options.page.pageId, notion.markdown);
  const warnings: string[] = [];
  if (notion.truncated) {
    warnings.push("notion_truncated");
  }
  if (notion.unknown_block_ids.length > 0) {
    warnings.push(`unknown_block_ids:${notion.unknown_block_ids.length}`);
  }

  let dbIndexed = false;
  let dbSkipped = false;
  if (!options.dryRun) {
    if (!options.tidbClient) {
      throw new AppError("tidb_client_missing", "TiDB client is required", 3);
    }
    const activeHash = await options.tidbClient.getPageHash(options.page.pageId);
    dbSkipped =
      !options.reindex &&
      activeHash === ids.markdownSha256;

    if (!dbSkipped) {
      await options.tidbClient.upsertPage({
        pageId: options.page.pageId,
        title: options.page.title,
        markdown: notion.markdown,
        markdownSha256: ids.markdownSha256,
        truncated: notion.truncated,
        unknownBlockIds: notion.unknown_block_ids
      });
      dbIndexed = true;
    }
  }

  const status = options.dryRun
    ? "dry_run"
    : dbSkipped
      ? "skipped"
      : "synced";

  return {
    pageId: options.page.pageId,
    status,
    markdownSha256: ids.markdownSha256,
    dbIndexed,
    warnings
  };
}

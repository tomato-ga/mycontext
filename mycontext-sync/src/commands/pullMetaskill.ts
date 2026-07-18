import { METASKILL_SOURCE, metaskillSourceRootFromEnv } from "../metaskill.js";
import { syncMetaskillDocument } from "../syncMetaskill.js";
import { createTidbClientFromEnv } from "../tidb.js";
import { type CliFlags } from "../types.js";

export async function runPullMetaskill(flags: CliFlags): Promise<void> {
  const sourceRoot = metaskillSourceRootFromEnv();
  const client = flags.dryRun ? null : createTidbClientFromEnv();
  try {
    const result = await syncMetaskillDocument({
      sourceRoot,
      source: METASKILL_SOURCE,
      tidbClient: client,
      dryRun: flags.dryRun,
      reindex: flags.reindex
    });
    console.log(JSON.stringify(result));
    console.log(JSON.stringify({
      status: "ok",
      documents_total: 1,
      documents_synced: result.status === "synced" ? 1 : 0,
      documents_skipped: result.status === "skipped" ? 1 : 0,
      sections_total: result.sectionCount,
      delivery_sections_total: result.deliverySectionCount,
      search_spans_total: result.searchSpanCount
    }, null, 2));
  } finally {
    await client?.close();
  }
}

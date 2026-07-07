import { loadMirrorConfig } from "../config.js";
import { createTidbClientFromEnv } from "../tidb.js";
import { AppError, toAppError, type CliFlags } from "../types.js";

export async function runSearch(flags: CliFlags): Promise<void> {
  if (!flags.query || flags.query.trim().length === 0) {
    throw new AppError("missing_query", "search requires --query", 3);
  }

  await loadMirrorConfig(flags.config);
  const tidbClient = createTidbClientFromEnv();
  try {
    const rows = await tidbClient.search(flags.query, flags.topK);
    console.log(
      JSON.stringify(
        rows.map((row) => ({
          page_id: row.page_id,
          title: row.title,
          text: excerpt(row.markdown, row.match_position)
        })),
        null,
        2
      )
    );
  } catch (error) {
    throw toAppError(error, "search_failed", "search failed", 3);
  } finally {
    await tidbClient.close();
  }
}

function excerpt(markdown: string, matchPosition: number): string {
  const index = Math.max(0, matchPosition - 1);
  const start = Math.max(0, index - 250);
  const end = Math.min(markdown.length, index + 450);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < markdown.length ? "..." : "";
  return `${prefix}${markdown.slice(start, end)}${suffix}`;
}

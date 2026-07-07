import { loadMirrorConfig } from "../config.js";
import { createTidbClientFromEnv } from "../tidb.js";
import { AppError, toAppError, type CliFlags } from "../types.js";

type DoctorStatus = "ok" | "missing_tidb_page" | "empty_markdown";

interface DoctorPageResult {
  pageId: string;
  title: string;
  status: DoctorStatus;
  markdownSha256: string | null;
  markdownChars: number;
  warnings: string[];
}

export async function runDoctor(flags: CliFlags): Promise<void> {
  try {
    const config = await loadMirrorConfig(flags.config);
    const client = createTidbClientFromEnv();
    const results: DoctorPageResult[] = [];

    try {
      await client.ping();
      for (const page of config.pages) {
        const row = await client.getPage(page.pageId);
        results.push({
          pageId: page.pageId,
          title: page.title,
          status: row === null ? "missing_tidb_page" : row.markdown.length === 0 ? "empty_markdown" : "ok",
          markdownSha256: row?.markdown_sha256 ?? null,
          markdownChars: row?.markdown.length ?? 0,
          warnings: parseUnknownBlockIds(row?.unknown_block_ids ?? null).map((id) => `unknown_block_id:${id}`)
        });
      }
    } finally {
      await client.close();
    }

    const failed = results.some((result) => result.status !== "ok");
    console.log(JSON.stringify({ status: failed ? "failed" : "ok", pages: results }, null, 2));
    if (failed) {
      process.exit(2);
    }
  } catch (error) {
    throw toAppError(error, "doctor_failed", "doctor failed", error instanceof AppError ? error.exitCode : 3);
  }
}

function parseUnknownBlockIds(value: string | string[] | null): string[] {
  if (value === null) {
    return [];
  }
  if (Array.isArray(value)) {
    return value;
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
      return parsed;
    }
  } catch (error) {
    throw new AppError("invalid_db_json", "unknown_block_ids JSON is invalid", 3, error);
  }
  throw new AppError("invalid_db_json", "unknown_block_ids JSON shape is invalid", 3);
}

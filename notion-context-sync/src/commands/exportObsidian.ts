import { exportObsidianPages } from "../obsidianExport.js";
import { createTidbClientFromEnv } from "../tidb.js";
import { optionalEnv } from "../config.js";
import { toAppError, type CliFlags } from "../types.js";
import os from "node:os";
import path from "node:path";

const DEFAULT_OUTPUT_DIR = "_notion_pages";

export async function runExportObsidian(flags: CliFlags): Promise<void> {
  const client = createTidbClientFromEnv();
  try {
    const pages = await client.listPages();
    const result = await exportObsidianPages({
      vaultPath: flags.vaultPath ?? optionalEnv("OBSIDIAN_VAULT_PATH") ?? DEFAULT_VAULT_PATH,
      outputDir: flags.outputDir ?? optionalEnv("OBSIDIAN_NOTION_OUTPUT_DIR") ?? DEFAULT_OUTPUT_DIR,
      pages
    });
    console.log(
      JSON.stringify(
        {
          status: "ok",
          output_root: result.outputRoot,
          pages_total: result.pagesTotal,
          files_written: result.filesWritten,
          files_unchanged: result.filesUnchanged,
          manifest_path: result.manifestPath
        },
        null,
        2
      )
    );
  } catch (error) {
    throw toAppError(error, "export_obsidian_failed", "export Obsidian failed", 3);
  } finally {
    await client.close();
  }
}

const DEFAULT_VAULT_PATH = path.join(
  os.homedir(),
  "Library",
  "Mobile Documents",
  "iCloud~md~obsidian",
  "Documents"
);

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { exportObsidianPages } from "../src/obsidianExport.js";
import type { NotionPageRow } from "../src/tidb.js";

describe("exportObsidianPages", () => {
  it("writes pages with required Obsidian properties and a manifest", async () => {
    const vaultPath = await fs.mkdtemp(path.join(os.tmpdir(), "notion-obsidian-export-"));
    const result = await exportObsidianPages({
      vaultPath,
      outputDir: "_notion_pages",
      now: new Date("2026-07-07T00:00:00.000Z"),
      pages: [
        page({
          page_id: "page-1",
          title: "Sample Profile",
          markdown: "# Profile\n\nBody",
          markdown_sha256: "abc",
          last_synced_at: "2026-07-07T01:00:00.000Z"
        })
      ]
    });

    expect(result.pagesTotal).toBe(1);
    expect(result.filesWritten).toBe(1);
    const exportedPath = path.join(vaultPath, "_notion_pages", "Sample Profile.md");
    const body = await fs.readFile(exportedPath, "utf8");
    expect(body).toContain("type: resource");
    expect(body).toContain("status: active");
    expect(body).toContain('notion_page_id: "page-1"');
    expect(body).toContain("# Profile\n\nBody\n");

    const manifest = JSON.parse(await fs.readFile(result.manifestPath, "utf8")) as {
      pages: Record<string, { relativePath: string }>;
    };
    expect(manifest.pages["page-1"]?.relativePath).toBe("Sample Profile.md");
  });

  it("reuses the previous path for the same page id", async () => {
    const vaultPath = await fs.mkdtemp(path.join(os.tmpdir(), "notion-obsidian-export-"));
    await exportObsidianPages({
      vaultPath,
      outputDir: "_notion_pages",
      pages: [page({ page_id: "page-1", title: "Old Title", markdown_sha256: "one" })]
    });
    await exportObsidianPages({
      vaultPath,
      outputDir: "_notion_pages",
      pages: [page({ page_id: "page-1", title: "New Title", markdown_sha256: "two" })]
    });

    await expect(fs.stat(path.join(vaultPath, "_notion_pages", "Old Title.md"))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(vaultPath, "_notion_pages", "New Title.md"))).rejects.toMatchObject({
      code: "ENOENT"
    });
  });
});

interface PageOverrides {
  page_id?: string;
  title?: string | null;
  markdown?: string;
  markdown_sha256?: string;
  truncated?: number | boolean;
  unknown_block_ids?: string | string[] | null;
  last_synced_at?: Date | string;
}

function page(overrides: PageOverrides): NotionPageRow {
  return {
    page_id: "page",
    title: "Title",
    markdown: "# Title",
    markdown_sha256: "hash",
    truncated: 0,
    unknown_block_ids: "[]",
    last_synced_at: "2026-07-07T00:00:00.000Z",
    ...overrides
  } as NotionPageRow;
}

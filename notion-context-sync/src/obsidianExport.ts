import fs from "node:fs/promises";
import path from "node:path";
import { AppError } from "./types.js";
import type { NotionPageRow } from "./tidb.js";

export interface ObsidianExportOptions {
  vaultPath: string;
  outputDir: string;
  pages: NotionPageRow[];
  now?: Date;
}

export interface ObsidianExportResult {
  outputRoot: string;
  pagesTotal: number;
  filesWritten: number;
  filesUnchanged: number;
  manifestPath: string;
}

interface ManifestPage {
  pageId: string;
  title: string | null;
  markdownSha256: string;
  relativePath: string;
  lastSyncedAt: string | null;
  exportedAt: string;
}

interface Manifest {
  version: 1;
  generatedAt: string;
  pages: Record<string, ManifestPage>;
}

export async function exportObsidianPages(options: ObsidianExportOptions): Promise<ObsidianExportResult> {
  const vaultRoot = path.resolve(options.vaultPath);
  const outputRoot = path.resolve(vaultRoot, options.outputDir);
  if (!isPathInside(outputRoot, vaultRoot)) {
    throw new AppError("unsafe_output_dir", "outputDir must resolve inside vaultPath", 3);
  }

  const now = options.now ?? new Date();
  const exportedAt = now.toISOString();
  const date = exportedAt.slice(0, 10);
  await fs.mkdir(outputRoot, { recursive: true });

  const manifestPath = path.join(outputRoot, ".notion-pages.json");
  const previousManifest = await readManifest(manifestPath);
  const usedRelativePaths = new Set<string>();
  let filesWritten = 0;
  let filesUnchanged = 0;
  const nextPages: Record<string, ManifestPage> = {};

  for (const page of options.pages) {
    const relativePath = chooseRelativePath(page, previousManifest, usedRelativePaths);
    usedRelativePaths.add(relativePath);
    const filePath = path.resolve(outputRoot, relativePath);
    if (!isPathInside(filePath, outputRoot)) {
      throw new AppError("unsafe_export_path", "export file must resolve inside outputDir", 3);
    }

    const body = buildObsidianMarkdown(page, date);
    const existing = await readOptional(filePath);
    if (existing === body) {
      filesUnchanged += 1;
    } else {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, body, "utf8");
      filesWritten += 1;
    }

    nextPages[page.page_id] = {
      pageId: page.page_id,
      title: page.title,
      markdownSha256: page.markdown_sha256,
      relativePath,
      lastSyncedAt: dateToIsoString(page.last_synced_at),
      exportedAt
    };
  }

  const manifest: Manifest = {
    version: 1,
    generatedAt: exportedAt,
    pages: nextPages
  };
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  return {
    outputRoot,
    pagesTotal: options.pages.length,
    filesWritten,
    filesUnchanged,
    manifestPath
  };
}

function buildObsidianMarkdown(page: NotionPageRow, date: string): string {
  return [
    "---",
    "type: resource",
    "status: active",
    'project: ""',
    `created: ${date}`,
    `updated: ${date}`,
    "tags: []",
    `notion_page_id: ${JSON.stringify(page.page_id)}`,
    `notion_markdown_sha256: ${JSON.stringify(page.markdown_sha256)}`,
    `notion_last_synced_at: ${JSON.stringify(dateToIsoString(page.last_synced_at))}`,
    "readonly: true",
    "---",
    "",
    page.markdown.trimEnd(),
    ""
  ].join("\n");
}

function chooseRelativePath(page: NotionPageRow, manifest: Manifest | null, usedRelativePaths: Set<string>): string {
  const existing = manifest?.pages[page.page_id]?.relativePath;
  if (existing && !usedRelativePaths.has(existing)) {
    return existing;
  }

  const baseName = sanitizeFileName(page.title ?? page.page_id);
  let candidate = `${baseName}.md`;
  let index = 2;
  while (usedRelativePaths.has(candidate)) {
    candidate = `${baseName}-${index}.md`;
    index += 1;
  }
  return candidate;
}

function sanitizeFileName(value: string): string {
  const sanitized = value
    .replace(/[\/\\:\*\?"<>\|\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return sanitized.length > 0 ? sanitized : "untitled";
}

async function readManifest(manifestPath: string): Promise<Manifest | null> {
  const raw = await readOptional(manifestPath);
  if (raw === null) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    const record = parsed as Record<string, unknown>;
    if (record.version !== 1 || !record.pages || typeof record.pages !== "object") {
      return null;
    }
    return parsed as Manifest;
  } catch {
    return null;
  }
}

async function readOptional(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function isPathInside(child: string, parent: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function dateToIsoString(value: Date | string | null): string | null {
  if (value === null) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

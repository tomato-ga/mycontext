export type MirrorStatus = "synced" | "conflict";

export type PageSyncStatus = "synced" | "skipped" | "failed" | "dry_run";

export interface PageConfig {
  pageId: string;
  title: string;
}

export interface MirrorConfig {
  pages: PageConfig[];
}

export interface NotionMarkdownResponse {
  object: string;
  id: string;
  markdown: string;
  truncated: boolean;
  unknown_block_ids: string[];
}

export interface NotionPageReference {
  pageId: string;
  title: string;
  parentPageId: string;
  kind: "child_page" | "link_to_page";
}

export interface SyncIdentifiers {
  markdownSha256: string;
}

export interface SyncPageResult {
  pageId: string;
  status: PageSyncStatus;
  markdownSha256: string;
  dbIndexed: boolean;
  warnings: string[];
}

export interface CliFlags {
  config: string;
  pageId?: string;
  dryRun: boolean;
  reindex: boolean;
  query?: string;
  topK: number;
  vaultPath?: string;
  outputDir?: string;
}

export class AppError extends Error {
  readonly code: string;
  readonly exitCode: number;

  constructor(code: string, message: string, exitCode = 1, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "AppError";
    this.code = code;
    this.exitCode = exitCode;
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function toAppError(error: unknown, code: string, message: string, exitCode = 1): AppError {
  if (error instanceof AppError) {
    return error;
  }
  return new AppError(code, `${message}: ${errorMessage(error)}`, exitCode, error);
}

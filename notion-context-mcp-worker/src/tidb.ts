import { connect, type Row as TidbRow } from "@tidbcloud/serverless";

export interface ListedDocument {
  page_id: string;
  title: string | null;
  markdown_sha256: string;
  truncated: boolean;
  last_synced_at: string | null;
}

export interface SearchContextHit {
  page_id: string;
  title: string | null;
  text: string;
  match_position: number;
}

export type SearchTextHit = SearchContextHit;

export interface FullDocument {
  page_id: string;
  title: string | null;
  markdown: string;
  markdown_sha256: string;
  source_truncated: boolean;
  unknown_block_ids: string[];
  last_synced_at: string | null;
}

export interface HealthCheckResult extends Record<string, unknown> {
  ok: boolean;
  db: "ok" | "error";
  documents_count?: number;
  latest_synced_at?: string | null;
}

export interface TidbClient {
  execute(sql: string, params?: readonly unknown[]): Promise<Record<string, unknown>[]>;
}

export class DataShapeError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DataShapeError";
  }
}

export class TopKValidationError extends RangeError {
  constructor(maxTopK = MAX_TOP_K) {
    super(`topK must be an integer from 1 to ${maxTopK}`);
    this.name = "TopKValidationError";
  }
}

const MAX_TOP_K = 20;

export function createTidbClient(databaseUrl: string): TidbClient {
  const connection = connect({ url: databaseUrl });

  return {
    async execute(sql, params = []) {
      const rows = await connection.execute(sql, [...params]);
      return rows.map(toRecordRow);
    }
  };
}

export async function listDocuments(client: TidbClient): Promise<ListedDocument[]> {
  const rows = await client.execute(
    `SELECT
        page_id,
        title,
        markdown_sha256,
        truncated,
        last_synced_at
      FROM notion_pages
      ORDER BY last_synced_at DESC, page_id ASC`
  );

  return rows.map((row) => ({
    page_id: parseRequiredString(row.page_id, "page_id"),
    title: parseNullableString(row.title, "title"),
    markdown_sha256: parseRequiredString(row.markdown_sha256, "markdown_sha256"),
    truncated: parseBoolean(row.truncated, "truncated"),
    last_synced_at: dateToIsoString(row.last_synced_at)
  }));
}

export async function searchContext(client: TidbClient, query: string, topK: number): Promise<SearchContextHit[]> {
  const limitedTopK = validateTopK(topK);
  const likePattern = buildLikePattern(query);
  const rows = await client.execute(buildSearchSql(limitedTopK), [query, likePattern]);

  return rows.map((row) => ({
    page_id: parseRequiredString(row.page_id, "page_id"),
    title: parseNullableString(row.title, "title"),
    text: parseRequiredString(row.markdown, "markdown"),
    match_position: parseNumber(row.match_position, "match_position")
  }));
}

export async function searchText(client: TidbClient, query: string, topK: number): Promise<SearchTextHit[]> {
  return searchContext(client, query, topK);
}

export async function getDocument(client: TidbClient, pageId: string): Promise<FullDocument | null> {
  const rows = await client.execute(
    `SELECT
        page_id,
        title,
        markdown,
        markdown_sha256,
        truncated,
        unknown_block_ids,
        last_synced_at
      FROM notion_pages
      WHERE page_id = ?
      LIMIT 1`,
    [pageId]
  );

  const row = rows[0];
  if (row === undefined) {
    return null;
  }

  return {
    page_id: parseRequiredString(row.page_id, "page_id"),
    title: parseNullableString(row.title, "title"),
    markdown: parseRequiredString(row.markdown, "markdown"),
    markdown_sha256: parseRequiredString(row.markdown_sha256, "markdown_sha256"),
    source_truncated: parseBoolean(row.truncated, "truncated"),
    unknown_block_ids: parseStringArray(row.unknown_block_ids, "unknown_block_ids"),
    last_synced_at: dateToIsoString(row.last_synced_at)
  };
}

export async function checkHealth(client: TidbClient): Promise<HealthCheckResult> {
  try {
    const rows = await client.execute(
      `SELECT
          COUNT(*) AS documents_count,
          MAX(last_synced_at) AS latest_synced_at
        FROM notion_pages`
    );
    const row = rows[0] ?? {};
    return {
      ok: true,
      db: "ok",
      documents_count: parseNumber(row.documents_count ?? 0, "documents_count"),
      latest_synced_at: dateToIsoString(row.latest_synced_at ?? null)
    };
  } catch {
    return {
      ok: false,
      db: "error"
    };
  }
}

export function validateTopK(topK: number, maxTopK = MAX_TOP_K): number {
  if (!Number.isInteger(topK) || topK < 1 || topK > maxTopK) {
    throw new TopKValidationError(maxTopK);
  }
  return topK;
}

export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export function buildLikePattern(query: string): string {
  return `%${escapeLikePattern(query)}%`;
}

export function buildSearchSql(topK: number): string {
  const limitedTopK = validateTopK(topK);
  return `SELECT
        page_id,
        title,
        markdown,
        LOCATE(?, markdown) AS match_position
      FROM notion_pages
      WHERE markdown LIKE ? ESCAPE '\\\\'
      ORDER BY last_synced_at DESC, page_id ASC
      LIMIT ${limitedTopK}`;
}

function toRecordRow(row: TidbRow): Record<string, unknown> {
  if (Array.isArray(row) || row === null || typeof row !== "object") {
    throw new DataShapeError("TiDB row must be an object");
  }
  return row as Record<string, unknown>;
}

function parseRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new DataShapeError(`${fieldName} must be a non-empty string`);
  }
  return value;
}

function parseNullableString(value: unknown, fieldName: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  throw new DataShapeError(`${fieldName} must be a string or null`);
}

function parseNumber(value: unknown, fieldName: string): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  throw new DataShapeError(`${fieldName} must be a number`);
}

function parseStringArray(value: unknown, fieldName: string): string[] {
  if (value === null || value === undefined) {
    return [];
  }
  if (Array.isArray(value)) {
    if (value.every((item) => typeof item === "string")) {
      return value;
    }
    throw new DataShapeError(`${fieldName} JSON array must contain only strings`);
  }
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return parseStringArray(parsed, fieldName);
    } catch (error) {
      if (error instanceof DataShapeError) {
        throw error;
      }
      throw new DataShapeError(`${fieldName} is not valid JSON`, { cause: error });
    }
  }
  throw new DataShapeError(`${fieldName} must be a JSON string array`);
}

function parseBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (value === 0) {
      return false;
    }
    if (value === 1) {
      return true;
    }
  }
  if (typeof value === "string") {
    if (value === "0" || value.toLowerCase() === "false") {
      return false;
    }
    if (value === "1" || value.toLowerCase() === "true") {
      return true;
    }
  }
  throw new DataShapeError(`${fieldName} must be boolean-like`);
}

function dateToIsoString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
    return value;
  }
  throw new DataShapeError("date value must be a Date, string, or null");
}

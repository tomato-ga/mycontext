import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import mysql, { type Pool, type RowDataPacket } from "mysql2/promise";
import { envBoolean, envNumber, optionalEnv, requireEnv } from "./config.js";
import { AppError } from "./types.js";

export interface TidbOptions {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  enableSsl: boolean;
  caPath?: string;
}

export interface NotionPageRow extends RowDataPacket {
  page_id: string;
  title: string | null;
  markdown: string;
  markdown_sha256: string;
  truncated: number | boolean;
  unknown_block_ids: string | string[] | null;
  last_synced_at: Date | string;
}

export interface SearchRow extends RowDataPacket {
  page_id: string;
  title: string | null;
  markdown: string;
  match_position: number;
}

export class TidbClient {
  private readonly pool: Pool;

  constructor(options: TidbOptions) {
    this.pool = mysql.createPool(createPoolConfig(options, true));
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async ping(): Promise<void> {
    const connection = await this.pool.getConnection();
    try {
      await connection.ping();
    } finally {
      connection.release();
    }
  }

  async applySchema(schemaPath: string): Promise<number> {
    const sql = await fsPromises.readFile(path.resolve(schemaPath), "utf8");
    const statements = sql
      .split(";")
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0);
    const connection = await this.pool.getConnection();
    try {
      for (const statement of statements) {
        await connection.query(statement);
      }
      return statements.length;
    } finally {
      connection.release();
    }
  }

  async getPageHash(pageId: string): Promise<string | null> {
    const [rows] = await this.pool.execute<Array<RowDataPacket & { markdown_sha256: string }>>(
      "SELECT markdown_sha256 FROM notion_pages WHERE page_id = ? LIMIT 1",
      [pageId]
    );
    return rows[0]?.markdown_sha256 ?? null;
  }

  async upsertPage(input: {
    pageId: string;
    title: string;
    markdown: string;
    markdownSha256: string;
    truncated: boolean;
    unknownBlockIds: string[];
  }): Promise<void> {
    await this.pool.execute(
      `INSERT INTO notion_pages
        (page_id, title, markdown, markdown_sha256, truncated, unknown_block_ids, last_synced_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW(3))
       ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        markdown = VALUES(markdown),
        markdown_sha256 = VALUES(markdown_sha256),
        truncated = VALUES(truncated),
        unknown_block_ids = VALUES(unknown_block_ids),
        last_synced_at = NOW(3)`,
      [
        input.pageId,
        input.title,
        input.markdown,
        input.markdownSha256,
        input.truncated,
        JSON.stringify(input.unknownBlockIds)
      ]
    );
  }

  async getPage(pageId: string): Promise<NotionPageRow | null> {
    const [rows] = await this.pool.execute<NotionPageRow[]>(
      `SELECT page_id, title, markdown, markdown_sha256, truncated, unknown_block_ids, last_synced_at
       FROM notion_pages
       WHERE page_id = ?
       LIMIT 1`,
      [pageId]
    );
    return rows[0] ?? null;
  }

  async listPages(): Promise<NotionPageRow[]> {
    const [rows] = await this.pool.execute<NotionPageRow[]>(
      `SELECT page_id, title, markdown, markdown_sha256, truncated, unknown_block_ids, last_synced_at
       FROM notion_pages
       ORDER BY title ASC, page_id ASC`
    );
    return rows;
  }

  async search(query: string, topK: number): Promise<SearchRow[]> {
    if (!Number.isInteger(topK) || topK <= 0) {
      throw new Error("topK must be a positive integer");
    }
    const likePattern = `%${escapeLikeWildcards(query)}%`;
    const [rows] = await this.pool.execute<SearchRow[]>(
      `SELECT
        page_id,
        title,
        markdown,
        LOCATE(?, markdown) AS match_position
       FROM notion_pages
       WHERE markdown LIKE ? ESCAPE '\\\\'
       ORDER BY last_synced_at DESC, page_id ASC
       LIMIT ${topK}`,
      [query, likePattern]
    );
    return rows;
  }
}

export function tidbOptionsFromEnv(): TidbOptions {
  return {
    host: requireEnv("TIDB_HOST"),
    port: envNumber("TIDB_PORT", 4000),
    user: requireEnv("TIDB_USER"),
    password: requireEnv("TIDB_PASSWORD"),
    database: optionalEnv("TIDB_DATABASE") ?? "notion_context",
    enableSsl: envBoolean("TIDB_ENABLE_SSL", true),
    caPath: optionalEnv("TIDB_CA_PATH")
  };
}

export function createTidbClientFromEnv(): TidbClient {
  return new TidbClient(tidbOptionsFromEnv());
}

export async function createDatabaseIfMissing(options: TidbOptions): Promise<void> {
  const pool = mysql.createPool(createPoolConfig(options, false));
  try {
    await pool.query(`CREATE DATABASE IF NOT EXISTS ${quoteDatabaseName(options.database)}`);
  } finally {
    await pool.end();
  }
}

function createPoolConfig(options: TidbOptions, includeDatabase: boolean) {
  const ssl = buildSsl(options);
  return {
    host: options.host,
    port: options.port,
    user: options.user,
    password: options.password,
    ...(includeDatabase ? { database: options.database } : {}),
    waitForConnections: true,
    connectionLimit: 4,
    namedPlaceholders: false,
    ...(ssl === undefined ? {} : { ssl })
  };
}

function buildSsl(options: TidbOptions) {
  if (!options.enableSsl) {
    return undefined;
  }
  const ca = options.caPath ? fs.readFileSync(options.caPath, "utf8") : undefined;
  return {
    minVersion: "TLSv1.2" as const,
    ...(ca === undefined ? {} : { ca })
  };
}

function quoteDatabaseName(database: string): string {
  if (!/^[A-Za-z0-9_$]+$/.test(database)) {
    throw new AppError("invalid_database_name", "TIDB_DATABASE contains unsupported characters", 3);
  }
  return `\`${database}\``;
}

function escapeLikeWildcards(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import mysql, { type Pool, type PoolConnection, type RowDataPacket } from "mysql2/promise";
import type {
  BusinessKnowledgeSection,
  LoadedBusinessKnowledgeDocument
} from "./businessKnowledge.js";
import type {
  AuthorStyleSection,
  LoadedAuthorStyleDocument
} from "./authorStyle.js";
import type {
  LoadedMetaskillDocument,
  MetaskillSection
} from "./metaskill.js";
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

export interface EditorKnowledgeDocumentRow extends RowDataPacket {
  document_id: string;
  title: string;
  markdown: string;
  markdown_sha256: string;
  last_synced_at: Date | string;
}

export interface BusinessKnowledgeDocumentRow extends RowDataPacket {
  document_id: string;
  title: string;
  source_path_key: string;
  source_kind: string;
  ingest_scope: string;
  source_declared_at: Date | string | null;
  source_bytes: number | string;
  source_line_count: number | string;
  source_mtime_ms: number | string;
  markdown: string;
  markdown_sha256: string;
  section_revision_sha256: string;
  parser_version: string;
  sectioning_version: string;
  section_count: number;
  search_span_count: number;
  outline_json: string | Record<string, unknown>;
  routing_metadata_json: string | Record<string, unknown>;
  last_synced_at: Date | string;
}

export interface BusinessKnowledgeSectionRow extends RowDataPacket {
  document_id: string;
  section_id: string;
  section_revision_sha256: string;
  parent_section_id: string | null;
  delivery_section_id: string;
  section_type: string;
  heading_level: number | null;
  section_number: string | null;
  title: string;
  heading_path_json: string | string[];
  content_layer: string;
  ordinal: number;
  source_line_start: number;
  source_line_end: number;
  direct_markdown: string;
  section_markdown: string;
  retrieval_text: string;
  content_sha256: string;
  is_searchable: number | boolean;
  related_source_path: string | null;
  freshness_class: string;
}

export interface AuthorStyleDocumentRow extends RowDataPacket {
  document_id: string;
  author_key: string;
  style_scope: string;
  display_name: string;
  source_path_key: string;
  active_revision_sha256: string | null;
  status: string;
  last_synced_at: Date | string | null;
}

export interface AuthorStyleRevisionRow extends RowDataPacket {
  document_id: string;
  revision_sha256: string;
  source_markdown: string;
  source_markdown_sha256: string;
  source_bytes: number | string;
  source_line_count: number | string;
  source_mtime_ms: number | string;
  parser_version: string;
  sectioning_version: string;
  routing_version: string;
  routing_manifest_json: string | Record<string, unknown>;
  outline_json: string | Record<string, unknown>;
  section_count: number | string;
  delivery_section_count: number | string;
  search_span_count: number | string;
  synced_at: Date | string;
}

export interface AuthorStyleSectionRow extends RowDataPacket {
  document_id: string;
  revision_sha256: string;
  section_id: string;
  context_key: string | null;
  parent_section_id: string | null;
  delivery_section_id: string;
  section_type: string;
  content_layer: string;
  context_priority: number | string;
  heading_level: number | null;
  title: string;
  heading_path_json: string | string[];
  aliases_json: string | string[];
  ordinal: number | string;
  source_line_start: number | string;
  source_line_end: number | string;
  content_chars: number | string;
  estimated_tokens: number | string | null;
  direct_markdown: string;
  delivery_markdown: string;
  retrieval_text: string;
  content_sha256: string;
  is_searchable: number | boolean;
}

export interface MetaskillDocumentRow extends RowDataPacket {
  document_id: string;
  collection_key: string;
  knowledge_scope: string;
  display_name: string;
  source_path_key: string;
  active_revision_sha256: string | null;
  status: string;
  last_synced_at: Date | string | null;
}

export interface MetaskillRevisionRow extends RowDataPacket {
  document_id: string;
  revision_sha256: string;
  source_markdown: string;
  source_markdown_sha256: string;
  source_bytes: number | string;
  source_line_count: number | string;
  source_mtime_ms: number | string;
  parser_version: string;
  sectioning_version: string;
  routing_version: string;
  routing_manifest_json: string | Record<string, unknown>;
  outline_json: string | Record<string, unknown>;
  section_count: number | string;
  delivery_section_count: number | string;
  search_span_count: number | string;
  synced_at: Date | string;
}

export interface MetaskillSectionRow extends RowDataPacket {
  document_id: string;
  revision_sha256: string;
  section_id: string;
  context_key: string | null;
  parent_section_id: string | null;
  delivery_section_id: string;
  section_type: string;
  content_layer: string;
  context_priority: number | string;
  heading_level: number | null;
  title: string;
  heading_path_json: string | string[];
  aliases_json: string | string[];
  ordinal: number | string;
  source_line_start: number | string;
  source_line_end: number | string;
  content_chars: number | string;
  estimated_tokens: number | string | null;
  direct_markdown: string;
  delivery_markdown: string;
  retrieval_text: string;
  content_sha256: string;
  is_searchable: number | boolean;
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

  async getEditorKnowledgeDocumentHash(documentId: string): Promise<string | null> {
    const [rows] = await this.pool.execute<Array<RowDataPacket & { markdown_sha256: string }>>(
      "SELECT markdown_sha256 FROM editor_knowledge_documents WHERE document_id = ? LIMIT 1",
      [documentId]
    );
    return rows[0]?.markdown_sha256 ?? null;
  }

  async upsertEditorKnowledgeDocument(input: {
    documentId: string;
    title: string;
    markdown: string;
    markdownSha256: string;
  }): Promise<void> {
    await this.pool.execute(
      `INSERT INTO editor_knowledge_documents
        (document_id, title, markdown, markdown_sha256, last_synced_at)
       VALUES (?, ?, ?, ?, NOW(3))
       ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        markdown = VALUES(markdown),
        markdown_sha256 = VALUES(markdown_sha256),
        last_synced_at = NOW(3)`,
      [input.documentId, input.title, input.markdown, input.markdownSha256]
    );
  }

  async getEditorKnowledgeDocument(documentId: string): Promise<EditorKnowledgeDocumentRow | null> {
    const [rows] = await this.pool.execute<EditorKnowledgeDocumentRow[]>(
      `SELECT document_id, title, markdown, markdown_sha256, last_synced_at
       FROM editor_knowledge_documents
       WHERE document_id = ?
       LIMIT 1`,
      [documentId]
    );
    return rows[0] ?? null;
  }

  async getBusinessKnowledgeDocumentRevision(documentId: string): Promise<string | null> {
    const [rows] = await this.pool.execute<Array<RowDataPacket & { section_revision_sha256: string }>>(
      `SELECT section_revision_sha256
       FROM business_knowledge_documents
       WHERE document_id = ?
       LIMIT 1`,
      [documentId]
    );
    return rows[0]?.section_revision_sha256 ?? null;
  }

  async getAuthorStyleDocumentRevision(documentId: string): Promise<string | null> {
    const [rows] = await this.pool.execute<Array<RowDataPacket & { active_revision_sha256: string | null }>>(
      `SELECT active_revision_sha256
       FROM author_style_documents
       WHERE document_id = ?
       LIMIT 1`,
      [documentId]
    );
    return rows[0]?.active_revision_sha256 ?? null;
  }

  async upsertAuthorStyleDocumentAndSections(document: LoadedAuthorStyleDocument): Promise<void> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        `INSERT INTO author_style_documents
          (document_id, author_key, style_scope, display_name, source_path_key,
           active_revision_sha256, status, last_synced_at)
         VALUES (?, ?, ?, ?, ?, NULL, 'active', NULL)
         ON DUPLICATE KEY UPDATE
          author_key = VALUES(author_key),
          style_scope = VALUES(style_scope),
          display_name = VALUES(display_name),
          source_path_key = VALUES(source_path_key),
          status = 'active'`,
        [
          document.documentId,
          document.authorKey,
          document.styleScope,
          document.displayName,
          document.sourcePathKey
        ]
      );
      await connection.execute(
        `INSERT INTO author_style_revisions
          (document_id, revision_sha256, source_markdown, source_markdown_sha256,
           source_bytes, source_line_count, source_mtime_ms, parser_version,
           sectioning_version, routing_version, routing_manifest_json, outline_json,
           section_count, delivery_section_count, search_span_count, synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))
         ON DUPLICATE KEY UPDATE
          source_markdown = VALUES(source_markdown),
          source_markdown_sha256 = VALUES(source_markdown_sha256),
          source_bytes = VALUES(source_bytes),
          source_line_count = VALUES(source_line_count),
          source_mtime_ms = VALUES(source_mtime_ms),
          parser_version = VALUES(parser_version),
          sectioning_version = VALUES(sectioning_version),
          routing_version = VALUES(routing_version),
          routing_manifest_json = VALUES(routing_manifest_json),
          outline_json = VALUES(outline_json),
          section_count = VALUES(section_count),
          delivery_section_count = VALUES(delivery_section_count),
          search_span_count = VALUES(search_span_count),
          synced_at = NOW(3)`,
        [
          document.documentId,
          document.revisionSha256,
          document.sourceMarkdown,
          document.sourceMarkdownSha256,
          document.sourceBytes,
          document.sourceLineCount,
          document.sourceMtimeMs,
          document.parserVersion,
          document.sectioningVersion,
          document.routingVersion,
          JSON.stringify(document.routingManifest),
          JSON.stringify(document.outline),
          document.sectionCount,
          document.deliverySectionCount,
          document.searchSpanCount
        ]
      );
      for (const section of document.sections) {
        await upsertAuthorStyleSection(connection, section);
      }
      await connection.execute(
        `UPDATE author_style_documents
         SET active_revision_sha256 = ?, last_synced_at = NOW(3)
         WHERE document_id = ?`,
        [document.revisionSha256, document.documentId]
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async getAuthorStyleDocument(documentId: string): Promise<AuthorStyleDocumentRow | null> {
    const [rows] = await this.pool.execute<AuthorStyleDocumentRow[]>(
      `SELECT document_id, author_key, style_scope, display_name, source_path_key,
              active_revision_sha256, status, last_synced_at
       FROM author_style_documents
       WHERE document_id = ?
       LIMIT 1`,
      [documentId]
    );
    return rows[0] ?? null;
  }

  async getAuthorStyleRevision(
    documentId: string,
    revisionSha256: string
  ): Promise<AuthorStyleRevisionRow | null> {
    const [rows] = await this.pool.execute<AuthorStyleRevisionRow[]>(
      `SELECT document_id, revision_sha256, source_markdown, source_markdown_sha256,
              source_bytes, source_line_count, source_mtime_ms, parser_version,
              sectioning_version, routing_version, routing_manifest_json, outline_json,
              section_count, delivery_section_count, search_span_count, synced_at
       FROM author_style_revisions
       WHERE document_id = ? AND revision_sha256 = ?
       LIMIT 1`,
      [documentId, revisionSha256]
    );
    return rows[0] ?? null;
  }

  async listAuthorStyleSections(
    documentId: string,
    revisionSha256: string
  ): Promise<AuthorStyleSectionRow[]> {
    const [rows] = await this.pool.execute<AuthorStyleSectionRow[]>(
      `SELECT document_id, revision_sha256, section_id, context_key,
              parent_section_id, delivery_section_id, section_type, content_layer,
              context_priority, heading_level, title, heading_path_json, aliases_json,
              ordinal, source_line_start, source_line_end, content_chars,
              estimated_tokens, direct_markdown, delivery_markdown, retrieval_text,
              content_sha256, is_searchable
       FROM author_style_sections
       WHERE document_id = ? AND revision_sha256 = ?
       ORDER BY ordinal ASC`,
      [documentId, revisionSha256]
    );
    return rows;
  }

  async getMetaskillDocumentRevision(documentId: string): Promise<string | null> {
    const [rows] = await this.pool.execute<Array<RowDataPacket & { active_revision_sha256: string | null }>>(
      `SELECT active_revision_sha256
       FROM metaskill_documents
       WHERE document_id = ?
       LIMIT 1`,
      [documentId]
    );
    return rows[0]?.active_revision_sha256 ?? null;
  }

  async upsertMetaskillDocumentAndSections(document: LoadedMetaskillDocument): Promise<void> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        `INSERT INTO metaskill_documents
          (document_id, collection_key, knowledge_scope, display_name, source_path_key,
           active_revision_sha256, status, last_synced_at)
         VALUES (?, ?, ?, ?, ?, NULL, 'active', NULL)
         ON DUPLICATE KEY UPDATE
          collection_key = VALUES(collection_key),
          knowledge_scope = VALUES(knowledge_scope),
          display_name = VALUES(display_name),
          source_path_key = VALUES(source_path_key),
          status = 'active'`,
        [
          document.documentId,
          document.collectionKey,
          document.knowledgeScope,
          document.displayName,
          document.sourcePathKey
        ]
      );
      await connection.execute(
        `INSERT INTO metaskill_revisions
          (document_id, revision_sha256, source_markdown, source_markdown_sha256,
           source_bytes, source_line_count, source_mtime_ms, parser_version,
           sectioning_version, routing_version, routing_manifest_json, outline_json,
           section_count, delivery_section_count, search_span_count, synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))
         ON DUPLICATE KEY UPDATE
          source_markdown = VALUES(source_markdown),
          source_markdown_sha256 = VALUES(source_markdown_sha256),
          source_bytes = VALUES(source_bytes),
          source_line_count = VALUES(source_line_count),
          source_mtime_ms = VALUES(source_mtime_ms),
          parser_version = VALUES(parser_version),
          sectioning_version = VALUES(sectioning_version),
          routing_version = VALUES(routing_version),
          routing_manifest_json = VALUES(routing_manifest_json),
          outline_json = VALUES(outline_json),
          section_count = VALUES(section_count),
          delivery_section_count = VALUES(delivery_section_count),
          search_span_count = VALUES(search_span_count),
          synced_at = NOW(3)`,
        [
          document.documentId,
          document.revisionSha256,
          document.sourceMarkdown,
          document.sourceMarkdownSha256,
          document.sourceBytes,
          document.sourceLineCount,
          document.sourceMtimeMs,
          document.parserVersion,
          document.sectioningVersion,
          document.routingVersion,
          JSON.stringify(document.routingManifest),
          JSON.stringify(document.outline),
          document.sectionCount,
          document.deliverySectionCount,
          document.searchSpanCount
        ]
      );
      for (const section of document.sections) {
        await upsertMetaskillSection(connection, section);
      }
      await connection.execute(
        `UPDATE metaskill_documents
         SET active_revision_sha256 = ?, last_synced_at = NOW(3)
         WHERE document_id = ?`,
        [document.revisionSha256, document.documentId]
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async getMetaskillDocument(documentId: string): Promise<MetaskillDocumentRow | null> {
    const [rows] = await this.pool.execute<MetaskillDocumentRow[]>(
      `SELECT document_id, collection_key, knowledge_scope, display_name, source_path_key,
              active_revision_sha256, status, last_synced_at
       FROM metaskill_documents
       WHERE document_id = ?
       LIMIT 1`,
      [documentId]
    );
    return rows[0] ?? null;
  }

  async getMetaskillRevision(
    documentId: string,
    revisionSha256: string
  ): Promise<MetaskillRevisionRow | null> {
    const [rows] = await this.pool.execute<MetaskillRevisionRow[]>(
      `SELECT document_id, revision_sha256, source_markdown, source_markdown_sha256,
              source_bytes, source_line_count, source_mtime_ms, parser_version,
              sectioning_version, routing_version, routing_manifest_json, outline_json,
              section_count, delivery_section_count, search_span_count, synced_at
       FROM metaskill_revisions
       WHERE document_id = ? AND revision_sha256 = ?
       LIMIT 1`,
      [documentId, revisionSha256]
    );
    return rows[0] ?? null;
  }

  async listMetaskillSections(
    documentId: string,
    revisionSha256: string
  ): Promise<MetaskillSectionRow[]> {
    const [rows] = await this.pool.execute<MetaskillSectionRow[]>(
      `SELECT document_id, revision_sha256, section_id, context_key,
              parent_section_id, delivery_section_id, section_type, content_layer,
              context_priority, heading_level, title, heading_path_json, aliases_json,
              ordinal, source_line_start, source_line_end, content_chars,
              estimated_tokens, direct_markdown, delivery_markdown, retrieval_text,
              content_sha256, is_searchable
       FROM metaskill_sections
       WHERE document_id = ? AND revision_sha256 = ?
       ORDER BY ordinal ASC`,
      [documentId, revisionSha256]
    );
    return rows;
  }

  async upsertBusinessKnowledgeDocumentAndSections(
    document: LoadedBusinessKnowledgeDocument
  ): Promise<void> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        `INSERT INTO business_knowledge_documents
          (document_id, title, source_path_key, source_kind, ingest_scope,
           source_declared_at, source_bytes, source_line_count, source_mtime_ms,
           markdown, markdown_sha256, section_revision_sha256, parser_version,
           sectioning_version, section_count, search_span_count, outline_json,
           routing_metadata_json, last_synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))
         ON DUPLICATE KEY UPDATE
          title = VALUES(title),
          source_path_key = VALUES(source_path_key),
          source_kind = VALUES(source_kind),
          ingest_scope = VALUES(ingest_scope),
          source_declared_at = VALUES(source_declared_at),
          source_bytes = VALUES(source_bytes),
          source_line_count = VALUES(source_line_count),
          source_mtime_ms = VALUES(source_mtime_ms),
          markdown = VALUES(markdown),
          markdown_sha256 = VALUES(markdown_sha256),
          section_revision_sha256 = VALUES(section_revision_sha256),
          parser_version = VALUES(parser_version),
          sectioning_version = VALUES(sectioning_version),
          section_count = VALUES(section_count),
          search_span_count = VALUES(search_span_count),
          outline_json = VALUES(outline_json),
          routing_metadata_json = VALUES(routing_metadata_json),
          last_synced_at = NOW(3)`,
        [
          document.documentId,
          document.title,
          document.sourcePathKey,
          document.sourceKind,
          document.ingestScope,
          document.sourceDeclaredAt,
          document.sourceBytes,
          document.sourceLineCount,
          document.sourceMtimeMs,
          document.markdown,
          document.markdownSha256,
          document.sectionRevisionSha256,
          document.parserVersion,
          document.sectioningVersion,
          document.sectionCount,
          document.searchSpanCount,
          JSON.stringify(document.outline),
          JSON.stringify(document.routingMetadata)
        ]
      );

      for (const section of document.sections) {
        await upsertBusinessKnowledgeSection(connection, section);
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async getBusinessKnowledgeDocument(
    documentId: string
  ): Promise<BusinessKnowledgeDocumentRow | null> {
    const [rows] = await this.pool.execute<BusinessKnowledgeDocumentRow[]>(
      `SELECT document_id, title, source_path_key, source_kind, ingest_scope,
              source_declared_at, source_bytes, source_line_count, source_mtime_ms,
              markdown, markdown_sha256,
              section_revision_sha256, parser_version, sectioning_version,
              section_count, search_span_count, outline_json,
              routing_metadata_json, last_synced_at
       FROM business_knowledge_documents
       WHERE document_id = ?
       LIMIT 1`,
      [documentId]
    );
    return rows[0] ?? null;
  }

  async listBusinessKnowledgeSections(
    documentId: string,
    sectionRevisionSha256: string
  ): Promise<BusinessKnowledgeSectionRow[]> {
    const [rows] = await this.pool.execute<BusinessKnowledgeSectionRow[]>(
      `SELECT document_id, section_id, section_revision_sha256,
              parent_section_id, delivery_section_id, section_type,
              heading_level, section_number, title, heading_path_json,
              content_layer, ordinal,
              source_line_start, source_line_end, direct_markdown,
              section_markdown, retrieval_text, content_sha256, is_searchable,
              related_source_path, freshness_class
       FROM business_knowledge_sections
       WHERE document_id = ?
         AND section_revision_sha256 = ?
       ORDER BY ordinal ASC`,
      [documentId, sectionRevisionSha256]
    );
    return rows;
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

async function upsertBusinessKnowledgeSection(
  connection: PoolConnection,
  section: BusinessKnowledgeSection
): Promise<void> {
  await connection.execute(
    `INSERT INTO business_knowledge_sections
      (document_id, section_id, section_revision_sha256, parent_section_id,
       delivery_section_id, section_type, heading_level, section_number, title,
       heading_path_json, content_layer, ordinal, source_line_start,
       source_line_end, direct_markdown, section_markdown, retrieval_text,
       content_sha256, is_searchable, related_source_path, freshness_class,
       last_synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))
     ON DUPLICATE KEY UPDATE
      parent_section_id = VALUES(parent_section_id),
      delivery_section_id = VALUES(delivery_section_id),
      section_type = VALUES(section_type),
      heading_level = VALUES(heading_level),
      section_number = VALUES(section_number),
      title = VALUES(title),
      heading_path_json = VALUES(heading_path_json),
      content_layer = VALUES(content_layer),
      ordinal = VALUES(ordinal),
      source_line_start = VALUES(source_line_start),
      source_line_end = VALUES(source_line_end),
      direct_markdown = VALUES(direct_markdown),
      section_markdown = VALUES(section_markdown),
      retrieval_text = VALUES(retrieval_text),
      content_sha256 = VALUES(content_sha256),
      is_searchable = VALUES(is_searchable),
      related_source_path = VALUES(related_source_path),
      freshness_class = VALUES(freshness_class),
      last_synced_at = NOW(3)`,
    [
      section.documentId,
      section.sectionId,
      section.sectionRevisionSha256,
      section.parentSectionId,
      section.deliverySectionId,
      section.sectionType,
      section.headingLevel,
      section.sectionNumber,
      section.title,
      JSON.stringify(section.headingPath),
      section.contentLayer,
      section.ordinal,
      section.sourceLineStart,
      section.sourceLineEnd,
      section.directMarkdown,
      section.sectionMarkdown,
      section.retrievalText,
      section.contentSha256,
      section.isSearchable,
      section.relatedSourcePath,
      section.freshnessClass
    ]
  );
}

async function upsertAuthorStyleSection(
  connection: PoolConnection,
  section: AuthorStyleSection
): Promise<void> {
  await connection.execute(
    `INSERT INTO author_style_sections
      (document_id, revision_sha256, section_id, context_key, parent_section_id,
       delivery_section_id, section_type, content_layer, context_priority,
       heading_level, title, heading_path_json, aliases_json, ordinal,
       source_line_start, source_line_end, content_chars, estimated_tokens,
       direct_markdown, delivery_markdown, retrieval_text, content_sha256,
       is_searchable)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      context_key = VALUES(context_key),
      parent_section_id = VALUES(parent_section_id),
      delivery_section_id = VALUES(delivery_section_id),
      section_type = VALUES(section_type),
      content_layer = VALUES(content_layer),
      context_priority = VALUES(context_priority),
      heading_level = VALUES(heading_level),
      title = VALUES(title),
      heading_path_json = VALUES(heading_path_json),
      aliases_json = VALUES(aliases_json),
      ordinal = VALUES(ordinal),
      source_line_start = VALUES(source_line_start),
      source_line_end = VALUES(source_line_end),
      content_chars = VALUES(content_chars),
      estimated_tokens = VALUES(estimated_tokens),
      direct_markdown = VALUES(direct_markdown),
      delivery_markdown = VALUES(delivery_markdown),
      retrieval_text = VALUES(retrieval_text),
      content_sha256 = VALUES(content_sha256),
      is_searchable = VALUES(is_searchable)`,
    [
      section.documentId,
      section.revisionSha256,
      section.sectionId,
      section.contextKey,
      section.parentSectionId,
      section.deliverySectionId,
      section.sectionType,
      section.contentLayer,
      section.contextPriority,
      section.headingLevel,
      section.title,
      JSON.stringify(section.headingPath),
      JSON.stringify(section.aliases),
      section.ordinal,
      section.sourceLineStart,
      section.sourceLineEnd,
      section.contentChars,
      section.estimatedTokens,
      section.directMarkdown,
      section.deliveryMarkdown,
      section.retrievalText,
      section.contentSha256,
      section.isSearchable
    ]
  );
}

async function upsertMetaskillSection(
  connection: PoolConnection,
  section: MetaskillSection
): Promise<void> {
  await connection.execute(
    `INSERT INTO metaskill_sections
      (document_id, revision_sha256, section_id, context_key, parent_section_id,
       delivery_section_id, section_type, content_layer, context_priority,
       heading_level, title, heading_path_json, aliases_json, ordinal,
       source_line_start, source_line_end, content_chars, estimated_tokens,
       direct_markdown, delivery_markdown, retrieval_text, content_sha256,
       is_searchable)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      context_key = VALUES(context_key),
      parent_section_id = VALUES(parent_section_id),
      delivery_section_id = VALUES(delivery_section_id),
      section_type = VALUES(section_type),
      content_layer = VALUES(content_layer),
      context_priority = VALUES(context_priority),
      heading_level = VALUES(heading_level),
      title = VALUES(title),
      heading_path_json = VALUES(heading_path_json),
      aliases_json = VALUES(aliases_json),
      ordinal = VALUES(ordinal),
      source_line_start = VALUES(source_line_start),
      source_line_end = VALUES(source_line_end),
      content_chars = VALUES(content_chars),
      estimated_tokens = VALUES(estimated_tokens),
      direct_markdown = VALUES(direct_markdown),
      delivery_markdown = VALUES(delivery_markdown),
      retrieval_text = VALUES(retrieval_text),
      content_sha256 = VALUES(content_sha256),
      is_searchable = VALUES(is_searchable)`,
    [
      section.documentId,
      section.revisionSha256,
      section.sectionId,
      section.contextKey,
      section.parentSectionId,
      section.deliverySectionId,
      section.sectionType,
      section.contentLayer,
      section.contextPriority,
      section.headingLevel,
      section.title,
      JSON.stringify(section.headingPath),
      JSON.stringify(section.aliases),
      section.ordinal,
      section.sourceLineStart,
      section.sourceLineEnd,
      section.contentChars,
      section.estimatedTokens,
      section.directMarkdown,
      section.deliveryMarkdown,
      section.retrievalText,
      section.contentSha256,
      section.isSearchable
    ]
  );
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

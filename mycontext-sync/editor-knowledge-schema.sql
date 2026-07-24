-- TiDB does not reliably support multiple ADD COLUMN IF NOT EXISTS clauses combined into one
-- multi-column-add statement; each new column is added by its own standalone statement
-- instead. Column order is never relied on anywhere in this codebase (every SELECT/INSERT
-- names its columns explicitly), so no AFTER clause is needed.
ALTER TABLE editor_knowledge_documents
  ADD COLUMN IF NOT EXISTS section_revision_sha256 CHAR(64) NULL;

ALTER TABLE editor_knowledge_documents
  ADD COLUMN IF NOT EXISTS section_count INT UNSIGNED NULL;

ALTER TABLE editor_knowledge_documents
  ADD COLUMN IF NOT EXISTS search_span_count INT UNSIGNED NULL;

CREATE TABLE IF NOT EXISTS editor_knowledge_sections (
  document_id VARCHAR(128) NOT NULL,
  section_id VARCHAR(255) NOT NULL,
  section_revision_sha256 CHAR(64) NOT NULL,
  parent_section_id VARCHAR(255) NULL,
  delivery_section_id VARCHAR(255) NOT NULL,
  section_type VARCHAR(32) NOT NULL,
  heading_level TINYINT UNSIGNED NULL,
  section_number VARCHAR(32) NULL,
  title VARCHAR(512) NOT NULL,
  heading_path_json JSON NOT NULL,
  content_layer VARCHAR(32) NOT NULL,
  ordinal INT UNSIGNED NOT NULL,
  source_line_start INT UNSIGNED NOT NULL,
  source_line_end INT UNSIGNED NOT NULL,
  direct_markdown MEDIUMTEXT NOT NULL,
  section_markdown MEDIUMTEXT NOT NULL,
  retrieval_text MEDIUMTEXT NOT NULL,
  content_sha256 CHAR(64) NOT NULL,
  is_searchable BOOLEAN NOT NULL,
  related_source_path VARCHAR(512) NULL,
  freshness_class VARCHAR(32) NOT NULL,
  last_synced_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (document_id, section_id, section_revision_sha256),
  UNIQUE KEY uk_editor_section_revision_ordinal
    (document_id, section_revision_sha256, ordinal),
  KEY idx_editor_section_revision (document_id, section_revision_sha256),
  KEY idx_editor_delivery_revision
    (document_id, delivery_section_id, section_revision_sha256),
  KEY idx_editor_searchable_revision
    (document_id, section_revision_sha256, is_searchable)
);

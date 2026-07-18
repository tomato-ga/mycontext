CREATE TABLE IF NOT EXISTS business_knowledge_documents (
  document_id VARCHAR(128) PRIMARY KEY,
  title VARCHAR(512) NOT NULL,
  source_path_key VARCHAR(512) NOT NULL,
  source_kind VARCHAR(64) NOT NULL,
  ingest_scope VARCHAR(64) NOT NULL,
  source_declared_at DATE NULL,
  source_bytes INT UNSIGNED NOT NULL,
  source_line_count INT UNSIGNED NOT NULL,
  source_mtime_ms BIGINT UNSIGNED NOT NULL,
  markdown MEDIUMTEXT NOT NULL,
  markdown_sha256 CHAR(64) NOT NULL,
  section_revision_sha256 CHAR(64) NOT NULL,
  parser_version VARCHAR(64) NOT NULL,
  sectioning_version VARCHAR(64) NOT NULL,
  section_count INT UNSIGNED NOT NULL,
  search_span_count INT UNSIGNED NOT NULL,
  outline_json JSON NOT NULL,
  routing_metadata_json JSON NOT NULL,
  last_synced_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_business_knowledge_source_path (source_path_key),
  KEY idx_business_knowledge_last_synced_at (last_synced_at)
);

CREATE TABLE IF NOT EXISTS business_knowledge_sections (
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
  UNIQUE KEY uk_business_section_revision_ordinal
    (document_id, section_revision_sha256, ordinal),
  KEY idx_business_section_revision (document_id, section_revision_sha256),
  KEY idx_business_delivery_revision
    (document_id, delivery_section_id, section_revision_sha256),
  KEY idx_business_searchable_revision
    (document_id, section_revision_sha256, is_searchable)
);

CREATE TABLE IF NOT EXISTS notion_pages (
  page_id VARCHAR(128) PRIMARY KEY,
  title VARCHAR(512) NULL,
  markdown MEDIUMTEXT NOT NULL,
  markdown_sha256 CHAR(64) NOT NULL,
  truncated BOOLEAN NOT NULL DEFAULT FALSE,
  unknown_block_ids JSON NULL,
  last_synced_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_title (title),
  KEY idx_last_synced_at (last_synced_at)
);

CREATE TABLE IF NOT EXISTS editor_knowledge_documents (
  document_id VARCHAR(128) PRIMARY KEY,
  title VARCHAR(512) NOT NULL,
  markdown MEDIUMTEXT NOT NULL,
  markdown_sha256 CHAR(64) NOT NULL,
  last_synced_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_title (title),
  KEY idx_last_synced_at (last_synced_at)
);

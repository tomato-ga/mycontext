import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { splitSqlStatements } from "../src/tidb.js";

describe("editor knowledge migration safety", () => {
  it("only adds nullable section-summary columns and one new sectioned table, with no destructive DDL/DML", async () => {
    const schemaUrl = new URL("../editor-knowledge-schema.sql", import.meta.url);
    const sql = await fs.readFile(schemaUrl, "utf8");

    expect(sql.match(/CREATE TABLE IF NOT EXISTS/gi)).toHaveLength(1);
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS editor_knowledge_sections");
    expect(sql).toMatch(/direct_markdown\s+MEDIUMTEXT\s+NOT NULL/i);
    expect(sql).toMatch(/section_markdown\s+MEDIUMTEXT\s+NOT NULL/i);
    expect(sql).toMatch(/retrieval_text\s+MEDIUMTEXT\s+NOT NULL/i);

    // TiDB does not reliably support several ADD COLUMN IF NOT EXISTS clauses combined into a
    // single ALTER TABLE statement (a multi-schema-change ALTER); this previously failed a
    // real migration run with "Unknown column ... in 'editor_knowledge_documents'". Each new
    // column must therefore be its own standalone ALTER TABLE statement.
    expect(sql.match(/ALTER TABLE/gi)).toHaveLength(3);
    expect(sql.match(/ALTER TABLE editor_knowledge_documents/gi)).toHaveLength(3);
    // the explanatory comment above the first ALTER intentionally contains a semicolon
    expect(sql).toMatch(/^--.*;/m);

    // Split exactly the way applySchema() will split this file at migration time (comment
    // lines stripped first). This is also a regression check for the earlier failure mode:
    // the leading comment above deliberately contains a semicolon, and it must not turn into
    // its own broken statement fragment.
    const statements = splitSqlStatements(sql);
    expect(statements).toHaveLength(4);
    const alterStatements = statements.filter((statement) => /ALTER TABLE/i.test(statement));
    expect(alterStatements).toHaveLength(3);
    for (const statement of statements) {
      expect(statement).not.toContain("--");
    }
    for (const statement of alterStatements) {
      // exactly one column add per statement — never a comma-separated multi-column ALTER
      expect(statement.match(/ADD COLUMN IF NOT EXISTS/gi)).toHaveLength(1);
    }

    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS section_revision_sha256 CHAR\(64\) NULL/i);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS section_count INT UNSIGNED NULL/i);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS search_span_count INT UNSIGNED NULL/i);
    // the ALTERs only add columns; they never drop, modify, or rename an existing one
    expect(sql).not.toMatch(/DROP COLUMN|MODIFY COLUMN|CHANGE COLUMN|RENAME/i);

    expect(sql).not.toMatch(/\b(?:DELETE|TRUNCATE|DROP TABLE)\b/i);
    expect(sql).not.toMatch(/\bbusiness_knowledge_documents\b/i);
    expect(sql).not.toMatch(/\bbusiness_knowledge_sections\b/i);
    expect(sql).not.toMatch(/\bnotion_pages\b/i);
  });
});

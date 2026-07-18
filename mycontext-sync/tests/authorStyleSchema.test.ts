import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("author style schema", () => {
  it("uses three dedicated revisioned tables and does not alter existing corpora", async () => {
    const sql = await fs.readFile(new URL("../author-style-schema.sql", import.meta.url), "utf8");

    expect(sql.match(/CREATE TABLE IF NOT EXISTS author_style_/g)).toHaveLength(3);
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS author_style_documents");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS author_style_revisions");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS author_style_sections");
    expect(sql).toContain("PRIMARY KEY (document_id, revision_sha256, section_id)");
    expect(sql).toContain("routing_manifest_json JSON NOT NULL");
    expect(sql).toContain("delivery_markdown MEDIUMTEXT NOT NULL");
    expect(sql).not.toMatch(/ALTER TABLE/);
    expect(sql).not.toContain("business_knowledge_");
    expect(sql).not.toContain("editor_knowledge_");
    expect(sql).not.toContain("notion_pages");
  });
});

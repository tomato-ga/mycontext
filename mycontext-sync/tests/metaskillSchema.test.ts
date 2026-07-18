import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("metaskill schema", () => {
  it("uses three dedicated revisioned tables without altering existing corpora", async () => {
    const sql = await fs.readFile(new URL("../metaskill-schema.sql", import.meta.url), "utf8");

    expect(sql.match(/CREATE TABLE IF NOT EXISTS metaskill_/g)).toHaveLength(3);
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS metaskill_documents");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS metaskill_revisions");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS metaskill_sections");
    expect(sql).toContain("PRIMARY KEY (document_id, revision_sha256, section_id)");
    expect(sql).toContain("routing_manifest_json JSON NOT NULL");
    expect(sql).toContain("delivery_markdown MEDIUMTEXT NOT NULL");
    expect(sql).not.toMatch(/ALTER TABLE/);
    expect(sql).not.toContain("author_style_");
    expect(sql).not.toContain("business_knowledge_");
  });
});

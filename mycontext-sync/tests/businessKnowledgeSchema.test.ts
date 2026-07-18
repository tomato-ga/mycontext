import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("business knowledge migration safety", () => {
  it("creates only the two dedicated tables and contains no destructive DDL/DML", async () => {
    const schemaUrl = new URL("../business-knowledge-schema.sql", import.meta.url);
    const sql = await fs.readFile(schemaUrl, "utf8");

    expect(sql.match(/CREATE TABLE IF NOT EXISTS/gi)).toHaveLength(2);
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS business_knowledge_documents");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS business_knowledge_sections");
    expect(sql).toMatch(/direct_markdown\s+MEDIUMTEXT\s+NOT NULL/i);
    expect(sql).toMatch(/section_markdown\s+MEDIUMTEXT\s+NOT NULL/i);
    expect(sql).toMatch(/retrieval_text\s+MEDIUMTEXT\s+NOT NULL/i);
    expect(sql).not.toMatch(/\b(?:DELETE|TRUNCATE|DROP|ALTER)\b/i);
    expect(sql).not.toMatch(/\bnotion_pages\b/i);
    expect(sql).not.toMatch(/\beditor_knowledge_documents\b/i);
  });
});

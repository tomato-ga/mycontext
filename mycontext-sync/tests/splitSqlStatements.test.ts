import { describe, expect, it } from "vitest";
import { splitSqlStatements } from "../src/tidb.js";

describe("splitSqlStatements", () => {
  it("does not split on a semicolon that only appears inside a whole-line comment", () => {
    // reproduces the exact failure reported against editor-knowledge-schema.sql: a "--"
    // comment containing "statement; each column" used to be sent to the server as its own
    // broken fragment once naively split on ";"
    const sql = [
      "-- each column is added by its own standalone statement; each is idempotent",
      "ALTER TABLE editor_knowledge_documents",
      "  ADD COLUMN IF NOT EXISTS section_revision_sha256 CHAR(64) NULL;",
      "",
      "CREATE TABLE IF NOT EXISTS editor_knowledge_sections (",
      "  document_id VARCHAR(128) NOT NULL",
      ");"
    ].join("\n");

    const statements = splitSqlStatements(sql);

    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain("ALTER TABLE editor_knowledge_documents");
    expect(statements[0]).not.toContain("--");
    expect(statements[1]).toContain("CREATE TABLE IF NOT EXISTS editor_knowledge_sections");
  });

  it("drops blank lines and whitespace-only statements", () => {
    const sql = "\n\n  \nCREATE TABLE IF NOT EXISTS t (id INT);\n\n  \n";
    expect(splitSqlStatements(sql)).toEqual(["CREATE TABLE IF NOT EXISTS t (id INT)"]);
  });

  it("strips a comment line even when indented", () => {
    const sql = [
      "ALTER TABLE t",
      "  -- indented comment; with a semicolon inside it",
      "  ADD COLUMN IF NOT EXISTS c INT NULL;"
    ].join("\n");

    const statements = splitSqlStatements(sql);
    expect(statements).toHaveLength(1);
    expect(statements[0]).not.toContain("--");
    expect(statements[0]).toContain("ADD COLUMN IF NOT EXISTS c INT NULL");
  });

  it("returns an empty array for a comment-only, statement-less file", () => {
    expect(splitSqlStatements("-- just a comment\n-- another; one\n")).toEqual([]);
  });
});

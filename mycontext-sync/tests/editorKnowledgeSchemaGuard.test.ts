import { describe, expect, it } from "vitest";
import { computeEditorKnowledgeSchemaGuardResult } from "../src/tidb.js";

describe("computeEditorKnowledgeSchemaGuardResult", () => {
  it("reports a fresh database with neither table yet, as a first-run baseline", () => {
    const result = computeEditorKnowledgeSchemaGuardResult([], 0, []);
    expect(result).toEqual({
      documentsTableExists: false,
      sectionsTableAlreadyExists: false,
      preexistingDocumentRowCount: 0,
      preexistingSectionColumns: [],
      columnTypeConflicts: []
    });
  });

  it("reports the pre-existing 8 lesson documents and no conflicts on a healthy re-run", () => {
    const result = computeEditorKnowledgeSchemaGuardResult(
      ["editor_knowledge_documents", "editor_knowledge_sections"],
      8,
      [
        { COLUMN_NAME: "section_revision_sha256", DATA_TYPE: "char" },
        { COLUMN_NAME: "section_count", DATA_TYPE: "int" },
        { COLUMN_NAME: "search_span_count", DATA_TYPE: "int" }
      ]
    );
    expect(result).toEqual({
      documentsTableExists: true,
      sectionsTableAlreadyExists: true,
      preexistingDocumentRowCount: 8,
      preexistingSectionColumns: ["section_revision_sha256", "section_count", "search_span_count"],
      columnTypeConflicts: []
    });
  });

  it("flags a column that already exists with an unexpected data type", () => {
    const result = computeEditorKnowledgeSchemaGuardResult(
      ["editor_knowledge_documents"],
      8,
      [{ COLUMN_NAME: "section_count", DATA_TYPE: "varchar" }]
    );
    expect(result.columnTypeConflicts).toEqual([
      { column: "section_count", expectedDataType: "int", actualDataType: "varchar" }
    ]);
  });

  it("never reports a document row count when the table does not exist yet", () => {
    const result = computeEditorKnowledgeSchemaGuardResult([], 999, []);
    expect(result.preexistingDocumentRowCount).toBe(0);
  });
});

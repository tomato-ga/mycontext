import { describe, expect, it, vi } from "vitest";
import { loadEditorKnowledgeSectionedDocument } from "../src/editorKnowledge.js";
import {
  syncEditorKnowledgeSectionedDocument,
  type EditorKnowledgeSectionedWriter
} from "../src/syncEditorKnowledgeSectioned.js";
import { writeKikakuCatalogFixture } from "./fixtures/editorKnowledgeSectionedFixture.js";

describe("syncEditorKnowledgeSectionedDocument", () => {
  it("skips the active section revision without writing", async () => {
    const fixture = await writeKikakuCatalogFixture();
    const loaded = await loadEditorKnowledgeSectionedDocument(fixture.root, fixture.source);
    const writer: EditorKnowledgeSectionedWriter = {
      getEditorKnowledgeSectionedDocumentRevision: vi.fn().mockResolvedValue(loaded.sectionRevisionSha256),
      upsertEditorKnowledgeSectionedDocumentAndSections: vi.fn().mockResolvedValue(undefined)
    };

    const result = await syncEditorKnowledgeSectionedDocument({
      sourceRoot: fixture.root,
      source: fixture.source,
      tidbClient: writer,
      dryRun: false,
      reindex: false
    });

    expect(result.status).toBe("skipped");
    expect(result.dbIndexed).toBe(false);
    expect(writer.upsertEditorKnowledgeSectionedDocumentAndSections).not.toHaveBeenCalled();
  });

  it("writes only through the dedicated editor knowledge sectioned writer method", async () => {
    const fixture = await writeKikakuCatalogFixture();
    const writer: EditorKnowledgeSectionedWriter = {
      getEditorKnowledgeSectionedDocumentRevision: vi.fn().mockResolvedValue(null),
      upsertEditorKnowledgeSectionedDocumentAndSections: vi.fn().mockResolvedValue(undefined)
    };

    const result = await syncEditorKnowledgeSectionedDocument({
      sourceRoot: fixture.root,
      source: fixture.source,
      tidbClient: writer,
      dryRun: false,
      reindex: false
    });

    expect(result).toMatchObject({
      status: "synced",
      documentId: "kikaku-db-catalog",
      sectionCount: 6,
      searchSpanCount: 4,
      dbIndexed: true
    });
    expect(writer.upsertEditorKnowledgeSectionedDocumentAndSections).toHaveBeenCalledOnce();
  });

  it("does not require a TiDB client in dry-run mode", async () => {
    const fixture = await writeKikakuCatalogFixture();
    const result = await syncEditorKnowledgeSectionedDocument({
      sourceRoot: fixture.root,
      source: fixture.source,
      tidbClient: null,
      dryRun: true,
      reindex: false
    });

    expect(result.status).toBe("dry_run");
    expect(result.dbIndexed).toBe(false);
  });
});

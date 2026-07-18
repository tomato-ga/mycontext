import { describe, expect, it, vi } from "vitest";
import {
  loadBusinessKnowledgeDocument
} from "../src/businessKnowledge.js";
import {
  syncBusinessKnowledgeDocument,
  type BusinessKnowledgeWriter
} from "../src/syncBusinessKnowledge.js";
import { writeMarketingWisdomFixture } from "./fixtures/businessKnowledgeFixture.js";

describe("syncBusinessKnowledgeDocument", () => {
  it("skips the active section revision without writing", async () => {
    const fixture = await writeMarketingWisdomFixture();
    const loaded = await loadBusinessKnowledgeDocument(fixture.root, fixture.source);
    const writer: BusinessKnowledgeWriter = {
      getBusinessKnowledgeDocumentRevision: vi.fn().mockResolvedValue(loaded.sectionRevisionSha256),
      upsertBusinessKnowledgeDocumentAndSections: vi.fn().mockResolvedValue(undefined)
    };

    const result = await syncBusinessKnowledgeDocument({
      sourceRoot: fixture.root,
      source: fixture.source,
      tidbClient: writer,
      dryRun: false,
      reindex: false
    });

    expect(result.status).toBe("skipped");
    expect(result.dbIndexed).toBe(false);
    expect(writer.upsertBusinessKnowledgeDocumentAndSections).not.toHaveBeenCalled();
  });

  it("writes only through the dedicated business knowledge writer method", async () => {
    const fixture = await writeMarketingWisdomFixture();
    const writer: BusinessKnowledgeWriter = {
      getBusinessKnowledgeDocumentRevision: vi.fn().mockResolvedValue(null),
      upsertBusinessKnowledgeDocumentAndSections: vi.fn().mockResolvedValue(undefined)
    };

    const result = await syncBusinessKnowledgeDocument({
      sourceRoot: fixture.root,
      source: fixture.source,
      tidbClient: writer,
      dryRun: false,
      reindex: false
    });

    expect(result).toMatchObject({
      status: "synced",
      sectionCount: 46,
      searchSpanCount: 46,
      dbIndexed: true
    });
    expect(writer.upsertBusinessKnowledgeDocumentAndSections).toHaveBeenCalledOnce();
  });

  it("does not require a TiDB client in dry-run mode", async () => {
    const fixture = await writeMarketingWisdomFixture();
    const result = await syncBusinessKnowledgeDocument({
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

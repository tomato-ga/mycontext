import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  METASKILL_SOURCE,
  loadMetaskillDocument,
  type LoadedMetaskillDocument
} from "../src/metaskill.js";
import { syncMetaskillDocument, type MetaskillWriter } from "../src/syncMetaskill.js";

vi.mock("../src/metaskill.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/metaskill.js")>();
  return { ...actual, loadMetaskillDocument: vi.fn() };
});

const document: LoadedMetaskillDocument = {
  documentId: "ai-self-strategy",
  collectionKey: "metaskill",
  knowledgeScope: "ai-self-strategy",
  displayName: "Metaskill",
  sourcePathKey: METASKILL_SOURCE.relativePath,
  sourceMarkdown: "# Metaskill",
  sourceMarkdownSha256: "a".repeat(64),
  sourceBytes: 11,
  sourceLineCount: 1,
  sourceMtimeMs: 1,
  revisionSha256: "b".repeat(64),
  parserVersion: "parser-v1",
  sectioningVersion: "semantic-v1",
  routingVersion: "routing-v1",
  routingManifest: {},
  outline: {},
  sectionCount: 0,
  deliverySectionCount: 0,
  searchSpanCount: 0,
  sections: []
};

describe("syncMetaskillDocument", () => {
  beforeEach(() => {
    vi.mocked(loadMetaskillDocument).mockResolvedValue(document);
  });

  it("skips an already active immutable revision", async () => {
    const writer: MetaskillWriter = {
      getMetaskillDocumentRevision: vi.fn().mockResolvedValue(document.revisionSha256),
      upsertMetaskillDocumentAndSections: vi.fn()
    };
    await expect(syncMetaskillDocument({
      sourceRoot: "/tmp/source",
      source: METASKILL_SOURCE,
      tidbClient: writer,
      dryRun: false,
      reindex: false
    })).resolves.toMatchObject({ status: "skipped", dbIndexed: false });
    expect(writer.upsertMetaskillDocumentAndSections).not.toHaveBeenCalled();
  });

  it("writes and activates a new revision", async () => {
    const writer: MetaskillWriter = {
      getMetaskillDocumentRevision: vi.fn().mockResolvedValue(null),
      upsertMetaskillDocumentAndSections: vi.fn()
    };
    await expect(syncMetaskillDocument({
      sourceRoot: "/tmp/source",
      source: METASKILL_SOURCE,
      tidbClient: writer,
      dryRun: false,
      reindex: false
    })).resolves.toMatchObject({ status: "synced", dbIndexed: true });
    expect(writer.upsertMetaskillDocumentAndSections).toHaveBeenCalledWith(document);
  });
});

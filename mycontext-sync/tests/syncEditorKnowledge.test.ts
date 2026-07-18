import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { sha256 } from "../src/hash.js";
import {
  syncEditorKnowledgeDocument,
  type EditorKnowledgeWriter
} from "../src/syncEditorKnowledge.js";

describe("syncEditorKnowledgeDocument", () => {
  it("skips an unchanged document", async () => {
    const fixture = await writeFixture();
    const writer: EditorKnowledgeWriter = {
      getEditorKnowledgeDocumentHash: vi.fn().mockResolvedValue(sha256(fixture.markdown)),
      upsertEditorKnowledgeDocument: vi.fn().mockResolvedValue(undefined)
    };

    const result = await syncEditorKnowledgeDocument({
      sourceRoot: fixture.root,
      source: fixture.source,
      tidbClient: writer,
      dryRun: false,
      reindex: false
    });

    expect(result.status).toBe("skipped");
    expect(result.dbIndexed).toBe(false);
    expect(writer.upsertEditorKnowledgeDocument).not.toHaveBeenCalled();
  });

  it("upserts a changed document", async () => {
    const fixture = await writeFixture();
    const writer: EditorKnowledgeWriter = {
      getEditorKnowledgeDocumentHash: vi.fn().mockResolvedValue("old-hash"),
      upsertEditorKnowledgeDocument: vi.fn().mockResolvedValue(undefined)
    };

    const result = await syncEditorKnowledgeDocument({
      sourceRoot: fixture.root,
      source: fixture.source,
      tidbClient: writer,
      dryRun: false,
      reindex: false
    });

    expect(result.status).toBe("synced");
    expect(result.dbIndexed).toBe(true);
    expect(writer.upsertEditorKnowledgeDocument).toHaveBeenCalledWith({
      documentId: "lesson-04",
      title: "第4回: 編集作業",
      markdown: fixture.markdown,
      markdownSha256: sha256(fixture.markdown)
    });
  });
});

async function writeFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "editor-knowledge-sync-"));
  const source = { documentId: "lesson-04" as const, relativePath: "lesson.md" };
  const markdown = "# 第4回: 編集作業\n\n本文\n";
  await fs.writeFile(path.join(root, source.relativePath), markdown, "utf8");
  return { root, source, markdown };
}

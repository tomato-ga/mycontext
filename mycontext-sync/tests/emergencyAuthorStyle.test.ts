import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { writeEmergencyAuthorStyleSnapshot } from "../src/emergencyAuthorStyle.js";

describe("emergency author-style Markdown", () => {
  it("writes exact Markdown separately from recovery metadata", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mycontext-emergency-"));
    const markdown = "# Exact source\n\nDo not add frontmatter.\n";
    const outputPath = path.join(root, "ore-body-style-revision.md");

    const result = await writeEmergencyAuthorStyleSnapshot({
      outputPath,
      markdown,
      metadata: {
        document_id: "ore-body-style",
        source: "tidb-active-revision",
        source_path_key: "notion:page-1",
        revision_sha256: "a".repeat(64),
        markdown_sha256: "b".repeat(64),
        exported_at: "2026-07-22T12:00:00.000Z",
        emergency_snapshot: true
      }
    });

    await expect(fs.readFile(result.markdownPath, "utf8")).resolves.toBe(markdown);
    await expect(fs.readFile(result.metadataPath, "utf8")).resolves.toContain(
      '"emergency_snapshot": true'
    );
  });
});

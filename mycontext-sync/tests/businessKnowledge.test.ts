import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { loadBusinessKnowledgeDocument } from "../src/businessKnowledge.js";
import {
  writeMarketingWisdomFixture,
  writeStartupScienceFixture
} from "./fixtures/businessKnowledgeFixture.js";

describe("business knowledge section-first parsing", () => {
  it("keeps Markdown headings as semantic boundaries and expands H3 hits to their H2 parent", async () => {
    const fixture = await writeStartupScienceFixture();
    const document = await loadBusinessKnowledgeDocument(fixture.root, fixture.source);

    expect(document.sectionCount).toBe(279);
    expect(document.searchSpanCount).toBe(241);
    expect(document.sections).toHaveLength(279);
    expect(new Set(document.sections.map((section) => section.sectionId)).size).toBe(279);
    expect(document.sections.every((section) => /^[A-Za-z0-9._~-]+$/.test(section.sectionId))).toBe(true);

    const hugeChild = document.sections.find((section) => section.title === "観点 1-1");
    expect(hugeChild?.sectionMarkdown.length).toBeGreaterThan(30_000);
    expect(hugeChild?.parentSectionId).toBe("detail-01");
    expect(hugeChild?.deliverySectionId).toBe("detail-01");
    expect(document.sections.filter((section) => section.parentSectionId === "detail-01")).toHaveLength(5);

    const parent = document.sections.find((section) => section.sectionId === "detail-01");
    expect(parent?.sectionMarkdown).toContain(hugeChild?.sectionMarkdown);
    expect(parent?.isSearchable).toBe(true);
    expect(document.sections.find((section) => section.sectionId === "detail-02")?.isSearchable).toBe(false);
    expect(document.sections.find((section) => section.sectionId === "detail-25")?.isSearchable).toBe(true);
  });

  it("uses virtual numbered sections for the marketing index and exposes detail routing metadata", async () => {
    const fixture = await writeMarketingWisdomFixture();
    const document = await loadBusinessKnowledgeDocument(fixture.root, fixture.source);

    expect(document.sectionCount).toBe(46);
    expect(document.searchSpanCount).toBe(46);
    expect(document.ingestScope).toBe("index_only");
    expect(document.sourceDeclaredAt).toBe("2026-02-20");
    expect(document.routingMetadata).toMatchObject({ detailAvailable: false });
    expect(document.sections.map((section) => section.sectionId)).toContain("core-message");
    expect(document.sections.find((section) => section.sectionId === "section-25")).toMatchObject({
      sectionNumber: "25",
      relatedSourcePath: "sections/10-ai-agent-aeo.md",
      freshnessClass: "time_sensitive"
    });
  });

  it("derives the active section revision from content and parser versions, not mtime", async () => {
    const fixture = await writeMarketingWisdomFixture();
    const before = await loadBusinessKnowledgeDocument(fixture.root, fixture.source);
    const sourcePath = `${fixture.root}/${fixture.source.relativePath}`;
    const future = new Date(Date.now() + 60_000);
    await fs.utimes(sourcePath, future, future);
    const after = await loadBusinessKnowledgeDocument(fixture.root, fixture.source);

    expect(after.sectionRevisionSha256).toBe(before.sectionRevisionSha256);
    expect(after.sourceMtimeMs).not.toBe(before.sourceMtimeMs);
  });
});

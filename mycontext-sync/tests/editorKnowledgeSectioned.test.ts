import { describe, expect, it } from "vitest";
import {
  loadEditorKnowledgeSectionedDocument,
  parseEditorKnowledgeSectionedMarkdown
} from "../src/editorKnowledge.js";
import {
  writeKikakuCatalogFixture,
  writeKikakuPlaybookFixture,
  writeKikakuSourceFixture
} from "./fixtures/editorKnowledgeSectionedFixture.js";

describe("parseEditorKnowledgeSectionedMarkdown (text-based, used by mycontext-sync-worker)", () => {
  it("parses Notion-fetched Markdown text directly, with no file I/O", () => {
    const markdown = [
      "# 企画構成プレイブック テスト版",
      "",
      "## 1. 企画の立て方",
      "第1章の本文。",
      ""
    ].join("\n");

    const document = parseEditorKnowledgeSectionedMarkdown({
      documentId: "kikaku-composition-playbook",
      markdown,
      sourcePathKey: "notion:abc123"
    });

    expect(document).toMatchObject({
      documentId: "kikaku-composition-playbook",
      title: "企画構成プレイブック テスト版",
      sourcePathKey: "notion:abc123",
      sectionCount: 1,
      searchSpanCount: 1
    });
    expect(document.sections[0]).toMatchObject({ sectionId: "chapter-01" });
  });

  it("produces the exact same result as the file-based loader for identical content", async () => {
    const fixture = await writeKikakuCatalogFixture();
    const fromFile = await loadEditorKnowledgeSectionedDocument(fixture.root, fixture.source);
    const fromText = parseEditorKnowledgeSectionedMarkdown({
      documentId: fixture.source.documentId,
      markdown: fixture.markdown,
      sourcePathKey: fixture.source.relativePath
    });
    expect(fromText).toEqual(fromFile);
  });

  it("rejects empty or NUL-containing Markdown, mirroring the file-based loader's guard", () => {
    expect(() => parseEditorKnowledgeSectionedMarkdown({
      documentId: "kikaku-db-catalog",
      markdown: "   ",
      sourcePathKey: "notion:abc123"
    })).toThrow(expect.objectContaining({ code: "editor_knowledge_invalid_markdown" }));
  });
});

describe("kikaku composition playbook parsing (editor knowledge, sectioned)", () => {
  it("treats each numbered ## chapter as one atomic, self-delivering detail section", async () => {
    const fixture = await writeKikakuPlaybookFixture();
    const document = await loadEditorKnowledgeSectionedDocument(fixture.root, fixture.source);

    expect(document.sectionCount).toBe(3);
    expect(document.searchSpanCount).toBe(3);
    expect(document.sections.map((section) => section.sectionId)).toEqual([
      "chapter-01",
      "chapter-02",
      "chapter-03"
    ]);

    const first = document.sections.find((section) => section.sectionId === "chapter-01");
    expect(first).toMatchObject({
      parentSectionId: null,
      deliverySectionId: "chapter-01",
      contentLayer: "detail",
      isSearchable: true,
      sectionNumber: "1",
      freshnessClass: "static_framework"
    });
    // a stylistic ### sub-heading inside a chapter is not split into its own section
    expect(first?.sectionMarkdown).toContain("### 補足メモ");
  });

  it("rejects a source with no ## chapter headings", async () => {
    const fixture = await writeKikakuSourceFixture(
      "kikaku-composition-playbook",
      "# 空のプレイブック\n\n本文のみ、章見出しなし。\n"
    );
    await expect(
      loadEditorKnowledgeSectionedDocument(fixture.root, fixture.source)
    ).rejects.toMatchObject({ code: "kikaku_playbook_no_chapters" });
  });

  it("rejects non-sequential chapter numbering", async () => {
    const fixture = await writeKikakuSourceFixture(
      "kikaku-composition-playbook",
      "# プレイブック\n\n## 1. 導入\n本文\n\n## 3. 飛び番\n本文\n"
    );
    await expect(
      loadEditorKnowledgeSectionedDocument(fixture.root, fixture.source)
    ).rejects.toMatchObject({ code: "business_knowledge_heading_sequence_mismatch" });
  });
});

describe("kikaku db catalog parsing (editor knowledge, sectioned)", () => {
  it("splits groups into an index layer and entries into a searchable detail layer", async () => {
    const fixture = await writeKikakuCatalogFixture();
    const document = await loadEditorKnowledgeSectionedDocument(fixture.root, fixture.source);

    expect(document.sectionCount).toBe(6);
    expect(document.searchSpanCount).toBe(4);
    expect(document.sections.map((section) => section.sectionId)).toEqual([
      "group-a",
      "no-001",
      "no-002",
      "group-b",
      "no-003",
      "x-01"
    ]);

    const groupA = document.sections.find((section) => section.sectionId === "group-a");
    expect(groupA).toMatchObject({
      contentLayer: "index",
      isSearchable: false,
      deliverySectionId: "group-a",
      sectionNumber: null,
      freshnessClass: "static_framework"
    });

    const entry = document.sections.find((section) => section.sectionId === "no-001");
    expect(entry).toMatchObject({
      contentLayer: "detail",
      isSearchable: true,
      deliverySectionId: "no-001",
      sectionNumber: "1",
      freshnessClass: "dated_example"
    });
    expect(entry?.retrievalText).toBe(entry?.sectionMarkdown);
    expect(entry?.retrievalText.startsWith("### No.1 ｜ 最初の企画")).toBe(true);

    const unnumbered = document.sections.find((section) => section.sectionId === "x-01");
    expect(unnumbered).toMatchObject({ sectionNumber: null, contentLayer: "detail", isSearchable: true });
  });

  it("rejects a source with zero ### entries", async () => {
    const fixture = await writeKikakuSourceFixture(
      "kikaku-db-catalog",
      "# 空のカタログ\n\n## グループのみ\nエントリなし。\n"
    );
    await expect(
      loadEditorKnowledgeSectionedDocument(fixture.root, fixture.source)
    ).rejects.toMatchObject({ code: "kikaku_catalog_no_entries" });
  });

  it("rejects a duplicate No. across entries", async () => {
    const fixture = await writeKikakuSourceFixture(
      "kikaku-db-catalog",
      [
        "# 重複カタログ",
        "",
        "## グループA",
        "### No.1 ｜ 一つ目",
        "本文",
        "",
        "### No.1 ｜ 重複",
        "本文",
        ""
      ].join("\n")
    );
    await expect(
      loadEditorKnowledgeSectionedDocument(fixture.root, fixture.source)
    ).rejects.toMatchObject({ code: "duplicate_business_knowledge_section_id" });
  });

  it("rejects an entry heading that appears before any group heading", async () => {
    const fixture = await writeKikakuSourceFixture(
      "kikaku-db-catalog",
      [
        "# 階層違反カタログ",
        "",
        "### No.1 ｜ グループ前のエントリ",
        "本文",
        "",
        "## グループA",
        "### No.2 ｜ 通常のエントリ",
        "本文",
        ""
      ].join("\n")
    );
    await expect(
      loadEditorKnowledgeSectionedDocument(fixture.root, fixture.source)
    ).rejects.toMatchObject({ code: "kikaku_catalog_orphan_entry" });
  });

  it("rejects entries with no ## group heading anywhere in the document", async () => {
    const fixture = await writeKikakuSourceFixture(
      "kikaku-db-catalog",
      [
        "# グループなしカタログ",
        "",
        "### No.1 ｜ グループのないエントリ",
        "本文",
        "",
        "### No.2 ｜ もう一つ",
        "本文",
        ""
      ].join("\n")
    );
    await expect(
      loadEditorKnowledgeSectionedDocument(fixture.root, fixture.source)
    ).rejects.toMatchObject({ code: "kikaku_catalog_orphan_entry" });
  });

  it("rejects a document with no ## or ### headings at all", async () => {
    const fixture = await writeKikakuSourceFixture(
      "kikaku-db-catalog",
      "# 見出しが一切ないカタログ\n\n本文だけがある。\n"
    );
    await expect(
      loadEditorKnowledgeSectionedDocument(fixture.root, fixture.source)
    ).rejects.toMatchObject({ code: "kikaku_catalog_no_entries" });
  });

  it("rejects a heading level deeper than ### inside the catalog", async () => {
    const fixture = await writeKikakuSourceFixture(
      "kikaku-db-catalog",
      [
        "# 深すぎる見出しカタログ",
        "",
        "## グループA",
        "### No.1 ｜ 通常のエントリ",
        "#### 深すぎる小見出し",
        "本文",
        ""
      ].join("\n")
    );
    await expect(
      loadEditorKnowledgeSectionedDocument(fixture.root, fixture.source)
    ).rejects.toMatchObject({ code: "kikaku_catalog_heading_level_invalid" });
  });

  it("rejects more than 10 group headings", async () => {
    const groups = Array.from({ length: 11 }, (_, index) => {
      return [`## グループ${index + 1}`, `### No.${index + 1} ｜ エントリ${index + 1}`, "本文", ""].join("\n");
    }).join("\n");
    const fixture = await writeKikakuSourceFixture(
      "kikaku-db-catalog",
      `# 群が多すぎるカタログ\n\n${groups}`
    );
    await expect(
      loadEditorKnowledgeSectionedDocument(fixture.root, fixture.source)
    ).rejects.toMatchObject({ code: "kikaku_catalog_too_many_groups" });
  });
});

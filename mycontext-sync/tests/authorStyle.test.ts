import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadAuthorStyleDocument,
  parseAuthorStyleMarkdown,
  type AuthorStyleSource
} from "../src/authorStyle.js";
import {
  buildAuthorStyleContext,
  enumerateAuthorStyleSelectors,
  parseAuthorStyleRoutingManifest
} from "../src/authorStyleRouting.js";

const TITLE_KEYS = [
  "ore-title/bootstrap",
  "ore-title/core",
  "ore-title/input-contract",
  "ore-title/router",
  "ore-title/mode/news",
  "ore-title/mode/reaction-explanation",
  "ore-title/mode/uncertainty",
  "ore-title/mode/experience",
  "ore-title/mode/interview",
  "ore-title/mode/practical",
  "ore-title/mode/sale",
  "ore-title/mode/narrative",
  "ore-title/notation",
  "ore-title/anti-patterns",
  "ore-title/evaluator",
  "ore-title/output-contract",
  "ore-title/retrieval-ops",
  "ore-title/maintenance",
  "ore-title/evidence"
];

describe("author style semantic storage", () => {
  it("parses all 19 title delivery units and ignores headings inside fences", async () => {
    const { root, source } = await writeSource("title.md", titleMarkdown(), "title");
    const document = await loadAuthorStyleDocument(root, source);

    expect(document.deliverySectionCount).toBe(19);
    expect(document.searchSpanCount).toBe(1);
    expect(document.sectionCount).toBe(20);
    expect(document.sections.filter((section) => section.contextKey !== null)
      .map((section) => section.contextKey)).toEqual(TITLE_KEYS);
    expect(document.sections.some((section) => section.title === "fenced fake heading")).toBe(false);
  });

  it("stores fine-grained body spans but returns every routed context as complete delivery units", async () => {
    const { root, source } = await writeSource("body.md", bodyMarkdown(), "body");
    const document = await loadAuthorStyleDocument(root, source);
    const manifest = parseAuthorStyleRoutingManifest(document.routingManifest);
    const sectionMap = new Map(document.sections.flatMap((section) => section.contextKey === null
      ? []
      : [[section.contextKey, {
          contextKey: section.contextKey,
          title: section.title,
          markdown: section.deliveryMarkdown
        }] as const]));
    const packs = enumerateAuthorStyleSelectors(manifest).map((selectors) =>
      buildAuthorStyleContext({
        documentId: document.documentId,
        displayName: document.displayName,
        revisionSha256: document.revisionSha256,
        manifest,
        selectors,
        sections: sectionMap
      })
    );

    expect(document.deliverySectionCount).toBe(41);
    expect(document.searchSpanCount).toBe(1);
    expect(document.sections.find((section) => section.title === "12.1 child")).toMatchObject({
      sectionType: "search_span",
      deliverySectionId: "flow"
    });
    expect(document.sections.find((section) => section.contextKey === "ore-body/longform/contract"))
      .toMatchObject({
        sectionType: "delivery",
        headingLevel: 3,
        title: "21.9 longform"
      });
    expect(document.sections.find((section) => section.contextKey === "ore-body/ops/references"))
      .toMatchObject({
        sectionType: "delivery",
        headingLevel: 2,
        title: "22. Chapter 22"
      });
    expect(document.parserVersion).toBe("author-style-parser-v2");
    expect(packs).toHaveLength(320);
    expect(packs.every((pack) => pack.contextChars <= manifest.maxContextChars)).toBe(true);
    expect(packs.every((pack) => new Set(pack.contextKeys).size === pack.contextKeys.length)).toBe(true);
  });

  it("parses Notion-provided Markdown without requiring a local file", () => {
    const source: AuthorStyleSource = {
      documentId: "ore-title-style",
      authorKey: "ore",
      styleScope: "title",
      relativePath: "knowledge/title.md"
    };
    const document = parseAuthorStyleMarkdown({
      source,
      markdown: titleMarkdown(),
      sourcePathKey: "notion:page-1",
      sourceMtimeMs: 123
    });

    expect(document.sourcePathKey).toBe("notion:page-1");
    expect(document.sourceMtimeMs).toBe(123);
    expect(document.deliverySectionCount).toBe(19);
  });
});

async function writeSource(
  filename: string,
  markdown: string,
  styleScope: "title" | "body"
): Promise<{ root: string; source: AuthorStyleSource }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "author-style-"));
  await fs.mkdir(path.join(root, "knowledge"));
  await fs.writeFile(path.join(root, "knowledge", filename), markdown);
  return {
    root,
    source: {
      documentId: styleScope === "title" ? "ore-title-style" : "ore-body-style",
      authorKey: "ore",
      styleScope,
      relativePath: `knowledge/${filename}`
    }
  };
}

function titleMarkdown(): string {
  return [
    "# Title style",
    "",
    ...TITLE_KEYS.flatMap((key, index) => [
      `## Section ${index + 1}`,
      "",
      `\`context-key: ${key}\``,
      "",
      `Rules for ${key}.`,
      ...(key === "ore-title/core"
        ? [
            "",
            "```md",
            "### fenced fake heading",
            "```",
            "",
            "### real child",
            "Child evidence."
          ]
        : []),
      ""
    ])
  ].join("\n");
}

function bodyMarkdown(): string {
  const lines = ["# Body style", "", "## Executive Summary", "", "Summary.", ""];
  for (let chapter = 1; chapter <= 22; chapter += 1) {
    lines.push(`## ${chapter}. Chapter ${chapter}`, "", `Chapter ${chapter} rules.`, "");
    if (chapter === 10 || chapter === 18) {
      for (let child = 1; child <= 5; child += 1) {
        lines.push(`### ${chapter}.${child} mode`, "", `Mode ${child}.`, "");
      }
    }
    if (chapter === 12) lines.push("### 12.1 child", "", "Flow evidence.", "");
    if (chapter === 21) {
      for (let child = 1; child <= 11; child += 1) {
        lines.push(`### 21.${child} longform`, "", `Longform ${child}.`, "");
      }
    }
  }
  return lines.join("\n");
}

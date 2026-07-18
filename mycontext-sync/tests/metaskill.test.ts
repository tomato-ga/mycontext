import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadMetaskillDocument, METASKILL_SOURCE } from "../src/metaskill.js";
import {
  buildMetaskillContext,
  enumerateMetaskillSelectors,
  parseMetaskillRoutingManifest
} from "../src/metaskillRouting.js";

const BODY_ANCHORS = [
  "第1章", "第2章", "メタスキル1　構造化", "不確実を確実性に変えるプロンプト",
  "【実際の出力例(一部を掲載)】", "「事前検死(プレモータム)」簡易版プロンプト",
  "【実際の出力例(一部を掲載)】", "「メタゲーム」", "ゲームの構造とルールを",
  "【実際の出力例(一部を掲載)】", "|ゲームをずらす|", "|ゲームをずらす|",
  "【実際の出力例(一部を掲載)】", "まとめ", "メタスキル3　自分モジュール化",
  "Z軸を見つけるディープリサーチ", "【実際の出力例(一部を掲載)】",
  "発想を広げるプロンプト", "【実際の出力例(一部を掲載)】",
  "メタスキル4　問いの言語化", "方向性を相談するプロンプト",
  "【実際の出力例(一部を掲載)】", "昇華する反論プロンプト",
  "【実際の出力例(一部を掲載)】", "「分解と統合」によるアイデアビルディング",
  "【実際の出力例(一部を掲載)】", "今、自分がいる状況を明確にするプロンプト",
  "【実際の出力例(一部を掲載)】", "メタスキル5　AIチーム術",
  "田軸んで自分の思考の解像度を高める", "【実際の出力例(一部掲載)】",
  "第3章", "モデル1　尾原流", "モデル2　深津流", "モデル3　けんすう流", "第4章",
  "おわりに」]|「正解」をAIに話し、自分だけの「意味」を生きる", "本書のまとめのプロンプト"
];

describe("metaskill semantic storage", () => {
  it("parses ordered OCR anchors and builds only complete semantic context packs", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "metaskill-"));
    const sourcePath = path.join(root, METASKILL_SOURCE.relativePath);
    await fs.mkdir(path.dirname(sourcePath), { recursive: true });
    const body = BODY_ANCHORS.flatMap((anchor, index) => [
      anchor,
      "",
      `This is a complete semantic paragraph for section ${index + 1}, long enough to search.`,
      ""
    ]);
    await fs.writeFile(sourcePath, [
      "# Metaskill fixture",
      "",
      "Introduction text that is long enough to become a searchable paragraph.",
      "",
      "第1章",
      "",
      "Table of contents text that is long enough to become a searchable paragraph.",
      "",
      ...body
    ].join("\n"));

    const document = await loadMetaskillDocument(root);
    const manifest = parseMetaskillRoutingManifest(document.routingManifest);
    const sectionMap = new Map(document.sections.flatMap((section) => section.contextKey === null
      ? []
      : [[section.contextKey, {
          contextKey: section.contextKey,
          title: section.title,
          markdown: section.deliveryMarkdown
        }] as const]));
    const packs = enumerateMetaskillSelectors(manifest).map((selectors) =>
      buildMetaskillContext({
        documentId: document.documentId,
        displayName: document.displayName,
        revisionSha256: document.revisionSha256,
        manifest,
        selectors,
        sections: sectionMap
      })
    );

    expect(document.deliverySectionCount).toBe(40);
    expect(document.searchSpanCount).toBeGreaterThan(0);
    expect(packs).toHaveLength(69);
    expect(packs.every((pack) => pack.markdown.includes("no section is truncated"))).toBe(true);
    expect(packs.every((pack) => new Set(pack.contextKeys).size === pack.contextKeys.length)).toBe(true);
    expect(document.sections.find((section) => section.contextKey === "metaskill/skill/structuring/prompt/premortem")?.deliveryMarkdown)
      .toContain("<prompt_template");
    expect(document.sections.find((section) => section.contextKey === "metaskill/skill/structuring/example/premortem")?.deliveryMarkdown)
      .toContain("<example_output");
  });
});

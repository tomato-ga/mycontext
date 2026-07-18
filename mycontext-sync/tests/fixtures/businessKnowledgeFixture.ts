import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { BusinessKnowledgeSource } from "../../src/businessKnowledge.js";

export async function writeStartupScienceFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "business-startup-"));
  const source: BusinessKnowledgeSource = {
    documentId: "startup-science",
    relativePath: "startup-science/startup-science-summary.md",
    sourceKind: "book_summary",
    ingestScope: "full_summary",
    sourceDeclaredAt: null
  };
  const lines = [
    "# 起業の科学 テスト版",
    "",
    "## 起業の科学の最重要ポイント"
  ];
  for (let number = 1; number <= 45; number += 1) {
    lines.push(`## ${number}) 重要ポイント ${number}`, `要約本文 ${number}`, "");
  }
  lines.push("## 目次", "- テスト用の目次（検索対象外）", "");

  const childBearingParents = Array.from({ length: 43 }, (_, index) => index + 1)
    .filter((number) => number !== 25);
  const fiveChildParents = new Set(childBearingParents.slice(0, 21));
  const directBodyParents = new Set([1, 3, 4, 9]);
  for (let number = 1; number <= 45; number += 1) {
    lines.push(`## ${number}. 詳細セクション ${number}`);
    if (directBodyParents.has(number)) {
      lines.push(`親見出し直下の導入 ${number}`);
    }
    const childCount = childBearingParents.includes(number)
      ? fiveChildParents.has(number) ? 5 : 4
      : 0;
    for (let child = 1; child <= childCount; child += 1) {
      lines.push(`### 観点 ${number}-${child}`);
      lines.push(number === 1 && child === 1
        ? `巨大な意味単位 ${"長文".repeat(20_000)}`
        : `詳細本文 ${number}-${child}`);
    }
    lines.push("");
  }

  const markdown = `${lines.join("\n")}\n`;
  const target = path.join(root, source.relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, markdown, "utf8");
  return { root, source, markdown };
}

export async function writeMarketingWisdomFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "business-marketing-"));
  const source: BusinessKnowledgeSource = {
    documentId: "marketing-wisdom",
    relativePath: "marketing-wisdom/wisdom-evolution-marketing-summary.md",
    sourceKind: "web_export_index",
    ingestScope: "index_only",
    sourceDeclaredAt: "2026-02-20"
  };
  const lines = [
    "# Wisdom Evolution テスト版",
    "",
    "## セクションファイル一覧",
    "- sections/01-who-what-how.md",
    "",
    "## 全45セクション概要"
  ];
  for (let number = 1; number <= 45; number += 1) {
    lines.push(`**§${number} テーマ ${number}** — 概要本文 ${number}`);
  }
  lines.push(
    "",
    "## 全体を貫く一貫したメッセージ",
    "WHO×WHAT×HOWを一貫させる。",
    "",
    "## 読み込みガイド",
    "詳細は関連ファイルを参照する。",
    ""
  );

  const markdown = lines.join("\n");
  const target = path.join(root, source.relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, markdown, "utf8");
  return { root, source, markdown };
}

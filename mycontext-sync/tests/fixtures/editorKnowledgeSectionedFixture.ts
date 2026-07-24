import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { EditorKnowledgeSectionedSource } from "../../src/editorKnowledge.js";

export async function writeKikakuPlaybookFixture() {
  const markdown = [
    "# 企画構成プレイブック テスト版",
    "",
    "## 1. 企画の立て方",
    "第1章の本文。",
    "",
    "### 補足メモ",
    "章本文に含まれるスタイル的な小見出し。",
    "",
    "## 2. 構成の作り方",
    "第2章の本文。",
    "",
    "## 3. 仕上げのチェック",
    "第3章の本文。",
    ""
  ].join("\n");
  return writeKikakuSourceFixture("kikaku-composition-playbook", markdown);
}

export async function writeKikakuCatalogFixture() {
  const markdown = [
    "# 企画カタログ427 テスト版",
    "",
    "## テーマ群A｜EC×D2C戦略",
    "グループAの概要文。",
    "",
    "### No.1 ｜ 最初の企画",
    "企画1の本文。",
    "",
    "### No.2 ｜ 二つ目の企画",
    "企画2の本文。",
    "",
    "## テーマ群B｜SNS運用",
    "グループBの概要文。",
    "",
    "### No.3 ｜ 三つ目の企画",
    "企画3の本文。",
    "",
    "### No.なし-1 ｜ 番号なしの企画",
    "番号なしエントリの本文。",
    ""
  ].join("\n");
  return writeKikakuSourceFixture("kikaku-db-catalog", markdown);
}

export async function writeKikakuSourceFixture(
  documentId: "kikaku-composition-playbook" | "kikaku-db-catalog",
  markdown: string
) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `editor-${documentId}-`));
  const relativePath = documentId === "kikaku-composition-playbook"
    ? "kikaku/composition-playbook.md"
    : "kikaku/kikaku-db-catalog.md";
  const source: EditorKnowledgeSectionedSource = { documentId, relativePath };
  const target = path.join(root, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, markdown, "utf8");
  return { root, source, markdown };
}

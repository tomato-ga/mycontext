import fs from "node:fs/promises";
import path from "node:path";
import { requireEnv } from "./config.js";
import { sha256 } from "./hash.js";
import { AppError } from "./types.js";

export const METASKILL_PARSER_VERSION = "metaskill-parser-v1";
export const METASKILL_SECTIONING_VERSION = "semantic-delivery-v1";
export const METASKILL_ROUTING_VERSION = "topic-context-pack-v1";
export const METASKILL_DOCUMENT_ID = "ai-self-strategy";

const MEDIUMTEXT_MAX_BYTES = 16_777_215;

export const METASKILL_TOPICS = [
  "overview",
  "ai-era-shift",
  "structuring",
  "game-shifting",
  "self-modularization",
  "question-verbalization",
  "ai-team",
  "life-strategy",
  "human-redefinition"
] as const;
export const METASKILL_INTENTS = ["understand", "apply", "prompt"] as const;
export const METASKILL_DEPTHS = ["brief", "standard", "deep"] as const;

export type MetaskillTopic = typeof METASKILL_TOPICS[number];
export type MetaskillIntent = typeof METASKILL_INTENTS[number];
export type MetaskillDepth = typeof METASKILL_DEPTHS[number];
export type MetaskillContentLayer =
  | "runtime"
  | "prompt"
  | "example"
  | "strategy"
  | "evidence"
  | "ops";

type SectionRole = "core" | "prompt" | "example";

export interface MetaskillSource {
  documentId: typeof METASKILL_DOCUMENT_ID;
  collectionKey: "metaskill";
  knowledgeScope: "ai-self-strategy";
  relativePath: string;
}

export interface MetaskillSection {
  documentId: typeof METASKILL_DOCUMENT_ID;
  revisionSha256: string;
  sectionId: string;
  contextKey: string | null;
  parentSectionId: string | null;
  deliverySectionId: string;
  sectionType: "delivery" | "search_span";
  contentLayer: MetaskillContentLayer;
  contextPriority: number;
  headingLevel: number | null;
  title: string;
  headingPath: string[];
  aliases: string[];
  ordinal: number;
  sourceLineStart: number;
  sourceLineEnd: number;
  contentChars: number;
  estimatedTokens: number | null;
  directMarkdown: string;
  deliveryMarkdown: string;
  retrievalText: string;
  contentSha256: string;
  isSearchable: boolean;
}

export interface LoadedMetaskillDocument {
  documentId: typeof METASKILL_DOCUMENT_ID;
  collectionKey: "metaskill";
  knowledgeScope: "ai-self-strategy";
  displayName: string;
  sourcePathKey: string;
  sourceMarkdown: string;
  sourceMarkdownSha256: string;
  sourceBytes: number;
  sourceLineCount: number;
  sourceMtimeMs: number;
  revisionSha256: string;
  parserVersion: string;
  sectioningVersion: string;
  routingVersion: string;
  routingManifest: Record<string, unknown>;
  outline: Record<string, unknown>;
  sectionCount: number;
  deliverySectionCount: number;
  searchSpanCount: number;
  sections: MetaskillSection[];
}

interface SectionDefinition {
  anchor: string;
  contextKey: string;
  title: string;
  topic: MetaskillTopic;
  role: SectionRole;
  contentLayer: MetaskillContentLayer;
  priority: number;
  aliases: string[];
}

interface ResolvedDefinition extends SectionDefinition {
  startIndex: number;
  endIndex: number;
}

interface DraftSection extends Omit<MetaskillSection, "documentId" | "revisionSha256" | "ordinal" | "contentSha256"> {}

export const METASKILL_SOURCE: MetaskillSource = {
  documentId: METASKILL_DOCUMENT_ID,
  collectionKey: "metaskill",
  knowledgeScope: "ai-self-strategy",
  relativePath: "docs/メタスキル_文字起こし.md"
};

const TOPIC_TITLES: Record<MetaskillTopic, string> = {
  overview: "全体像",
  "ai-era-shift": "AI時代の構造変化",
  structuring: "構造化",
  "game-shifting": "ゲームをずらす",
  "self-modularization": "自分モジュール化",
  "question-verbalization": "問いの言語化",
  "ai-team": "AIチーム術",
  "life-strategy": "人生戦略と資産循環",
  "human-redefinition": "AI時代の人間の再定義"
};

const BODY_DEFINITIONS: readonly SectionDefinition[] = [
  definition("第1章", "metaskill/chapter/ai-era-shift", "第1章 努力の方向性が変わる瞬間", "ai-era-shift", "core", "evidence", 85, ["努力の価値", "正解の価値", "AI時代"]),
  definition("第2章", "metaskill/core/chapter2-intro", "第2章 メタスキルの全体像", "overview", "core", "runtime", 90, ["汎用知", "メタスキル"]),
  definition("メタスキル1　構造化", "metaskill/skill/structuring/core", "メタスキル1 構造化", "structuring", "core", "runtime", 100, ["不確実性", "第一原理", "死なない構造"]),
  definition("不確実を確実性に変えるプロンプト", "metaskill/skill/structuring/prompt/first-principles", "不確実性を確実性に変えるプロンプト", "structuring", "prompt", "prompt", 95, ["システムアーキテクト", "第一原理思考"]),
  definition("【実際の出力例(一部を掲載)】", "metaskill/skill/structuring/example/first-principles", "構造化プロンプトの出力例", "structuring", "example", "example", 55, ["出力例"]),
  definition("「事前検死(プレモータム)」簡易版プロンプト", "metaskill/skill/structuring/prompt/premortem", "事前検死（プレモータム）プロンプト", "structuring", "prompt", "prompt", 95, ["事前検死", "プレモータム", "失敗の先回り"]),
  definition("【実際の出力例(一部を掲載)】", "metaskill/skill/structuring/example/premortem", "事前検死プロンプトの出力例", "structuring", "example", "example", 55, ["出力例", "プレモータム"]),
  definition("「メタゲーム」", "metaskill/skill/game-shifting/core", "メタスキル2 ゲームをずらす", "game-shifting", "core", "runtime", 100, ["メタゲーム", "非対称戦略", "ゲーム盤"]),
  definition("ゲームの構造とルールを", "metaskill/skill/game-shifting/prompt/rule-analysis", "ゲームの構造とルールを理解するプロンプト", "game-shifting", "prompt", "prompt", 95, ["KPI", "勝利条件", "ルール分析"]),
  definition("【実際の出力例(一部を掲載)】", "metaskill/skill/game-shifting/example/rule-analysis", "ゲーム分析プロンプトの出力例", "game-shifting", "example", "example", 55, ["出力例", "評価制度"]),
  definition("|ゲームをずらす|", "metaskill/skill/game-shifting/core/kpi-abstraction", "KPIや条件を抽象化して別のゲームを見つける", "game-shifting", "core", "runtime", 95, ["KPIハック", "抽象化", "別のゲーム"]),
  definition("|ゲームをずらす|", "metaskill/skill/game-shifting/core/extreme-conditions", "極端な設定で思考の壁を突き破る", "game-shifting", "core", "runtime", 95, ["極端な条件", "思考実験"]),
  definition("【実際の出力例(一部を掲載)】", "metaskill/skill/game-shifting/example/extreme-conditions", "極端な条件を使った出力例", "game-shifting", "example", "example", 50, ["出力例", "同窓会"]),
  definition("まとめ", "metaskill/skill/game-shifting/core/summary", "ゲームをずらす章のまとめ", "game-shifting", "core", "runtime", 85, ["参加しない理由", "頭がいい人と競わない"]),
  definition("メタスキル3　自分モジュール化", "metaskill/skill/self-modularization/core", "メタスキル3 自分モジュール化", "self-modularization", "core", "runtime", 100, ["モジュール化", "自分の知能", "AIチーム"]),
  definition("Z軸を見つけるディープリサーチ", "metaskill/skill/self-modularization/prompt/z-axis", "Z軸を見つけるディープリサーチ", "self-modularization", "prompt", "prompt", 95, ["Z軸", "多次元分析", "カテゴリークリエイター"]),
  definition("【実際の出力例(一部を掲載)】", "metaskill/skill/self-modularization/example/z-axis", "Z軸リサーチの出力例", "self-modularization", "example", "example", 55, ["出力例", "学習塾"]),
  definition("発想を広げるプロンプト", "metaskill/skill/self-modularization/prompt/global-scan", "世界の事例から発想を広げるプロンプト", "self-modularization", "prompt", "prompt", 95, ["5か国語スキャン", "海外事例", "先行事例"]),
  definition("【実際の出力例(一部を掲載)】", "metaskill/skill/self-modularization/example/global-scan", "世界事例リサーチの出力例", "self-modularization", "example", "example", 50, ["出力例", "海外事例"]),
  definition("メタスキル4　問いの言語化", "metaskill/skill/question-verbalization/core", "メタスキル4 問いの言語化", "question-verbalization", "core", "runtime", 100, ["質問", "問い", "言語化"]),
  definition("方向性を相談するプロンプト", "metaskill/skill/question-verbalization/prompt/direction", "方向性を相談するプロンプト", "question-verbalization", "prompt", "prompt", 95, ["方向性", "構造変化"]),
  definition("【実際の出力例(一部を掲載)】", "metaskill/skill/question-verbalization/example/direction", "方向性相談プロンプトの出力例", "question-verbalization", "example", "example", 50, ["出力例"]),
  definition("昇華する反論プロンプト", "metaskill/skill/question-verbalization/prompt/red-team", "レッドチーム演習に昇華する反論プロンプト", "question-verbalization", "prompt", "prompt", 95, ["レッドチーム", "反論", "意地悪な視点"]),
  definition("【実際の出力例(一部を掲載)】", "metaskill/skill/question-verbalization/example/red-team", "レッドチーム演習の出力例", "question-verbalization", "example", "example", 50, ["出力例", "反論"]),
  definition("「分解と統合」によるアイデアビルディング", "metaskill/skill/question-verbalization/prompt/decompose-integrate", "分解と統合によるアイデアビルディング", "question-verbalization", "prompt", "prompt", 95, ["分解と統合", "不満からの逆算", "新規事業"]),
  definition("【実際の出力例(一部を掲載)】", "metaskill/skill/question-verbalization/example/decompose-integrate", "アイデアビルディングの出力例", "question-verbalization", "example", "example", 50, ["出力例", "教育サービス"]),
  definition("今、自分がいる状況を明確にするプロンプト", "metaskill/skill/question-verbalization/prompt/current-position", "現在地を明確にするプロンプト", "question-verbalization", "prompt", "prompt", 95, ["現在地", "目的地", "キャリア"]),
  definition("【実際の出力例(一部を掲載)】", "metaskill/skill/question-verbalization/example/current-position", "現在地整理プロンプトの出力例", "question-verbalization", "example", "example", 50, ["出力例", "旅行会社"]),
  definition("メタスキル5　AIチーム術", "metaskill/skill/ai-team/core", "メタスキル5 AIチーム術", "ai-team", "core", "runtime", 100, ["AIチーム", "AI家庭教師", "アンラーニング"]),
  definition("田軸んで自分の思考の解像度を高める", "metaskill/skill/ai-team/core/thinking-resolution", "AIで思考の解像度を高める", "ai-team", "core", "runtime", 90, ["思考の解像度", "多層説明", "スパーリングパートナー"]),
  definition("【実際の出力例(一部掲載)】", "metaskill/skill/ai-team/example/multilevel-explanation", "多層説明の出力例", "ai-team", "example", "example", 50, ["5歳児向け", "専門家向け", "実践者向け"]),
  definition("第3章", "metaskill/strategy/overview", "第3章 AIで資産を循環させる仕組み", "life-strategy", "core", "strategy", 100, ["資産循環", "フライホイール", "人生戦略"]),
  definition("モデル1　尾原流", "metaskill/strategy/obara-flywheel", "尾原流 AIをブースターにする戦略", "life-strategy", "core", "strategy", 95, ["勝ちまくる", "フライホイール", "自己中心的利他"]),
  definition("モデル2　深津流", "metaskill/strategy/fukatsu-survival", "深津流 AIを検死官にする戦略", "life-strategy", "core", "strategy", 95, ["死なない", "生存戦略", "事前検死"]),
  definition("モデル3　けんすう流", "metaskill/strategy/kensuu-game-shift", "けんすう流 ゲームのルールをずらす戦略", "life-strategy", "core", "strategy", 95, ["非合理な聖域", "ゲームを変える"]),
  definition("第4章", "metaskill/future/human-redefinition", "第4章 AI時代の人間の再定義", "human-redefinition", "core", "strategy", 100, ["モノカルチャー", "インテンション", "人間の再定義"]),
  definition("おわりに」]|「正解」をAIに話し、自分だけの「意味」を生きる", "metaskill/future/meaning", "おわりに 正解をAIに託し、自分だけの意味を生きる", "human-redefinition", "core", "strategy", 90, ["意味", "自由意志", "デジタルアルチザン"]),
  definition("本書のまとめのプロンプト", "metaskill/core/summary-prompt", "本書のまとめのプロンプト", "overview", "prompt", "prompt", 90, ["まとめ", "実践プロンプト"])
];

export function metaskillSourceRootFromEnv(): string {
  const sourceRoot = requireEnv("METASKILL_SOURCE_ROOT");
  if (!path.isAbsolute(sourceRoot)) {
    throw new AppError(
      "invalid_metaskill_source_root",
      "METASKILL_SOURCE_ROOT must be an absolute path",
      3
    );
  }
  return path.resolve(sourceRoot);
}

export async function loadMetaskillDocument(
  sourceRoot: string,
  source: MetaskillSource = METASKILL_SOURCE
): Promise<LoadedMetaskillDocument> {
  const absoluteRoot = path.resolve(sourceRoot);
  const sourcePath = path.resolve(absoluteRoot, source.relativePath);
  const relative = path.relative(absoluteRoot, sourcePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new AppError("metaskill_path_escape", "metaskill source path escapes configured root", 3);
  }

  let bytes: Buffer;
  let stat: Awaited<ReturnType<typeof fs.stat>>;
  try {
    [bytes, stat] = await Promise.all([fs.readFile(sourcePath), fs.stat(sourcePath)]);
  } catch (error) {
    throw new AppError("metaskill_read_failed", "failed to read metaskill source", 3, error);
  }

  let sourceMarkdown: string;
  try {
    sourceMarkdown = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
  } catch (error) {
    throw new AppError("metaskill_invalid_utf8", "metaskill source is not valid UTF-8", 3, error);
  }
  if (sourceMarkdown.trim().length === 0 || sourceMarkdown.includes("\0")) {
    throw new AppError("metaskill_invalid_markdown", "metaskill source is empty or contains NUL", 3);
  }

  const normalized = sourceMarkdown.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const displayName = requireTitle(lines);
  const chapterOneOccurrences = exactLineIndexes(lines, "第1章");
  if (chapterOneOccurrences.length < 2) {
    throw new AppError(
      "metaskill_body_anchor_missing",
      "expected separate table-of-contents and body 第1章 anchors",
      3
    );
  }
  const tocStartIndex = chapterOneOccurrences[0] as number;
  const bodyStartIndex = chapterOneOccurrences[1] as number;
  const resolved = resolveBodyDefinitions(lines, bodyStartIndex);
  const drafts: DraftSection[] = [
    makeDeliverySection({
      displayName,
      lines,
      startIndex: 0,
      endIndex: Math.max(0, tocStartIndex - 1),
      definition: definition(
        "# メタスキル — キャプチャ文字起こし",
        "metaskill/bootstrap",
        "メタスキルの書誌情報と中心テーマ",
        "overview",
        "core",
        "runtime",
        100,
        ["AI×自分", "努力の価値", "メタスキル"]
      )
    }),
    makeDeliverySection({
      displayName,
      lines,
      startIndex: tocStartIndex,
      endIndex: bodyStartIndex - 1,
      definition: definition(
        "第1章",
        "metaskill/core/map",
        "本書の章・メタスキル・戦略マップ",
        "overview",
        "core",
        "runtime",
        95,
        ["目次", "5つのメタスキル", "3つの戦略モデル"]
      )
    }),
    ...resolved.map((item) => makeDeliverySection({
      displayName,
      lines,
      startIndex: item.startIndex,
      endIndex: item.endIndex,
      definition: item
    }))
  ];

  const withSpans = drafts.flatMap((delivery) => [
    delivery,
    ...makeSearchSpans(displayName, lines, delivery)
  ]);
  const routingManifest = buildRoutingManifest(drafts);
  const sourceMarkdownSha256 = sha256(sourceMarkdown);
  const revisionSha256 = sha256([
    sourceMarkdownSha256,
    METASKILL_PARSER_VERSION,
    METASKILL_SECTIONING_VERSION,
    METASKILL_ROUTING_VERSION,
    JSON.stringify(routingManifest)
  ].join("\0"));
  const sections = withSpans.map((section, index): MetaskillSection => ({
    ...section,
    documentId: source.documentId,
    revisionSha256,
    ordinal: index + 1,
    contentSha256: sha256(section.directMarkdown)
  }));
  assertSections(sections);
  assertStorageLimits(sourceMarkdown, sections);

  return {
    documentId: source.documentId,
    collectionKey: source.collectionKey,
    knowledgeScope: source.knowledgeScope,
    displayName,
    sourcePathKey: source.relativePath,
    sourceMarkdown,
    sourceMarkdownSha256,
    sourceBytes: bytes.byteLength,
    sourceLineCount: lines.length,
    sourceMtimeMs: Math.trunc(stat.mtimeMs),
    revisionSha256,
    parserVersion: METASKILL_PARSER_VERSION,
    sectioningVersion: METASKILL_SECTIONING_VERSION,
    routingVersion: METASKILL_ROUTING_VERSION,
    routingManifest,
    outline: {
      sourceQuality: "ocr_transcription",
      tocStartLine: tocStartIndex + 1,
      bodyStartLine: bodyStartIndex + 1,
      deliveries: drafts.map((section) => ({
        sectionId: section.sectionId,
        contextKey: section.contextKey,
        title: section.title,
        headingPath: section.headingPath,
        sourceLineStart: section.sourceLineStart,
        sourceLineEnd: section.sourceLineEnd,
        contentLayer: section.contentLayer
      }))
    },
    sectionCount: sections.length,
    deliverySectionCount: drafts.length,
    searchSpanCount: sections.length - drafts.length,
    sections
  };
}

function definition(
  anchor: string,
  contextKey: string,
  title: string,
  topic: MetaskillTopic,
  role: SectionRole,
  contentLayer: MetaskillContentLayer,
  priority: number,
  aliases: string[]
): SectionDefinition {
  return { anchor, contextKey, title, topic, role, contentLayer, priority, aliases };
}

function resolveBodyDefinitions(lines: string[], bodyStartIndex: number): ResolvedDefinition[] {
  const starts: number[] = [];
  let cursor = bodyStartIndex;
  for (const item of BODY_DEFINITIONS) {
    const startIndex = findExactLine(lines, item.anchor, cursor);
    if (startIndex === -1) {
      throw new AppError(
        "metaskill_section_anchor_missing",
        `missing ordered metaskill anchor after line ${cursor + 1}: ${item.anchor}`,
        3
      );
    }
    starts.push(startIndex);
    cursor = startIndex + 1;
  }
  return BODY_DEFINITIONS.map((item, index) => ({
    ...item,
    startIndex: starts[index] as number,
    endIndex: (starts[index + 1] ?? lines.length) - 1
  }));
}

function makeDeliverySection(input: {
  displayName: string;
  lines: string[];
  startIndex: number;
  endIndex: number;
  definition: SectionDefinition;
}): DraftSection {
  const { definition: item } = input;
  const directMarkdown = sliceLines(input.lines, input.startIndex, input.endIndex);
  const sectionId = sectionIdFromContextKey(item.contextKey);
  const headingPath = [input.displayName, TOPIC_TITLES[item.topic], item.title];
  const tag = item.role === "prompt"
    ? "prompt_template"
    : item.role === "example"
      ? "example_output"
      : "knowledge_section";
  const deliveryMarkdown = [
    `## ${item.title}`,
    "",
    `<${tag} topic="${item.topic}" source="metaskill-book">`,
    directMarkdown,
    `</${tag}>`
  ].join("\n");
  return {
    sectionId,
    contextKey: item.contextKey,
    parentSectionId: null,
    deliverySectionId: sectionId,
    sectionType: "delivery",
    contentLayer: item.contentLayer,
    contextPriority: item.priority,
    headingLevel: item.contextKey.startsWith("metaskill/chapter/") ? 2 : 3,
    title: item.title,
    headingPath,
    aliases: [...new Set([item.title, item.contextKey, ...item.aliases])],
    sourceLineStart: input.startIndex + 1,
    sourceLineEnd: input.endIndex + 1,
    contentChars: directMarkdown.length,
    estimatedTokens: estimateTokens(deliveryMarkdown),
    directMarkdown,
    deliveryMarkdown,
    retrievalText: retrievalText(directMarkdown, [item.title, item.contextKey, ...item.aliases]),
    isSearchable: true
  };
}

function makeSearchSpans(
  displayName: string,
  lines: string[],
  delivery: DraftSection
): DraftSection[] {
  const spans: DraftSection[] = [];
  const startIndex = delivery.sourceLineStart - 1;
  const endIndex = delivery.sourceLineEnd - 1;
  let paragraphStart: number | null = null;
  let spanNumber = 0;

  const flush = (paragraphEnd: number): void => {
    if (paragraphStart === null) return;
    const directMarkdown = sliceLines(lines, paragraphStart, paragraphEnd);
    paragraphStart = null;
    if (directMarkdown.length < 20 || directMarkdown === delivery.directMarkdown) return;
    spanNumber += 1;
    const sectionId = `${delivery.sectionId}--span-${String(spanNumber).padStart(3, "0")}`;
    spans.push({
      sectionId,
      contextKey: null,
      parentSectionId: delivery.sectionId,
      deliverySectionId: delivery.sectionId,
      sectionType: "search_span",
      contentLayer: delivery.contentLayer,
      contextPriority: Math.max(0, delivery.contextPriority - 10),
      headingLevel: null,
      title: `${delivery.title} — 検索スパン${spanNumber}`,
      headingPath: [...delivery.headingPath, `検索スパン${spanNumber}`],
      aliases: delivery.aliases,
      sourceLineStart: paragraphEnd - directMarkdown.split("\n").length + 2,
      sourceLineEnd: paragraphEnd + 1,
      contentChars: directMarkdown.length,
      estimatedTokens: estimateTokens(directMarkdown),
      directMarkdown,
      deliveryMarkdown: delivery.deliveryMarkdown,
      retrievalText: retrievalText(directMarkdown, delivery.aliases),
      isSearchable: true
    });
  };

  for (let index = startIndex; index <= endIndex; index += 1) {
    if ((lines[index] ?? "").trim().length === 0) {
      flush(index - 1);
    } else if (paragraphStart === null) {
      paragraphStart = index;
    }
  }
  flush(endIndex);
  return spans;
}

function buildRoutingManifest(deliveries: DraftSection[]): Record<string, unknown> {
  const byTopic = new Map<MetaskillTopic, { core: string[]; prompt: string[]; example: string[] }>();
  for (const topic of METASKILL_TOPICS) byTopic.set(topic, { core: [], prompt: [], example: [] });
  for (const delivery of deliveries) {
    const topic = topicFromHeadingPath(delivery.headingPath);
    const group = byTopic.get(topic);
    if (group === undefined || delivery.contextKey === null) continue;
    const role: SectionRole = delivery.contentLayer === "prompt"
      ? "prompt"
      : delivery.contentLayer === "example"
        ? "example"
        : "core";
    group[role].push(delivery.contextKey);
  }

  const routes: Record<string, string[]> = {};
  for (const topic of METASKILL_TOPICS) {
    const group = byTopic.get(topic) as { core: string[]; prompt: string[]; example: string[] };
    addRoutes(routes, topic, "understand", group.core, group.prompt, group.example);
    addRoutes(routes, topic, "apply", group.core, group.prompt, group.example);
    if (group.prompt.length > 0) {
      addRoutes(routes, topic, "prompt", group.core, group.prompt, group.example);
    }
  }
  return {
    schemaVersion: METASKILL_ROUTING_VERSION,
    selectorSchema: {
      topics: [...METASKILL_TOPICS],
      intents: [...METASKILL_INTENTS],
      depths: [...METASKILL_DEPTHS]
    },
    routes,
    maxContextCharsByDepth: { brief: 20_000, standard: 50_000, deep: 90_000 },
    overflowPolicy: "error_no_truncation"
  };
}

function addRoutes(
  routes: Record<string, string[]>,
  topic: MetaskillTopic,
  intent: MetaskillIntent,
  core: string[],
  prompts: string[],
  examples: string[]
): void {
  const firstCore = core.slice(0, 1);
  const firstPrompt = prompts.slice(0, 1);
  if (intent === "understand") {
    routes[routeKey(topic, intent, "brief")] = firstCore;
    routes[routeKey(topic, intent, "standard")] = core;
    routes[routeKey(topic, intent, "deep")] = [...core, ...examples];
    return;
  }
  if (intent === "apply") {
    routes[routeKey(topic, intent, "brief")] = [...firstCore, ...firstPrompt];
    routes[routeKey(topic, intent, "standard")] = [...core, ...prompts];
    routes[routeKey(topic, intent, "deep")] = [...core, ...prompts, ...examples];
    return;
  }
  routes[routeKey(topic, intent, "brief")] = firstPrompt;
  routes[routeKey(topic, intent, "standard")] = prompts;
  routes[routeKey(topic, intent, "deep")] = [...prompts, ...examples];
}

function routeKey(topic: MetaskillTopic, intent: MetaskillIntent, depth: MetaskillDepth): string {
  return `${topic}:${intent}:${depth}`;
}

function topicFromHeadingPath(pathParts: string[]): MetaskillTopic {
  const topicTitle = pathParts[1];
  const entry = Object.entries(TOPIC_TITLES).find(([, title]) => title === topicTitle);
  if (entry === undefined) throw new AppError("metaskill_topic_missing", "section topic is missing", 3);
  return entry[0] as MetaskillTopic;
}

function requireTitle(lines: string[]): string {
  const first = lines.find((line) => line.startsWith("# "));
  if (first === undefined) throw new AppError("metaskill_title_missing", "metaskill H1 is missing", 3);
  return first.slice(2).trim();
}

function exactLineIndexes(lines: string[], value: string): number[] {
  return lines.flatMap((line, index) => line.trim() === value ? [index] : []);
}

function findExactLine(lines: string[], value: string, fromIndex: number): number {
  for (let index = fromIndex; index < lines.length; index += 1) {
    if ((lines[index] ?? "").trim() === value) return index;
  }
  return -1;
}

function sliceLines(lines: string[], startIndex: number, endIndex: number): string {
  return lines.slice(startIndex, endIndex + 1).join("\n").trim();
}

function retrievalText(markdown: string, aliases: string[]): string {
  const normalized = `${aliases.join(" ")}\n${markdown}`.normalize("NFKC");
  return `${aliases.join("\n")}\n${markdown}\n${normalized}`;
}

function estimateTokens(value: string): number {
  return Math.max(1, Math.ceil(value.length / 2));
}

function sectionIdFromContextKey(contextKey: string): string {
  return contextKey.replace(/^metaskill\//, "").replace(/\//g, "--");
}

function assertSections(sections: MetaskillSection[]): void {
  const ids = new Set<string>();
  const keys = new Set<string>();
  for (const section of sections) {
    if (ids.has(section.sectionId)) {
      throw new AppError("metaskill_duplicate_section_id", `duplicate section id: ${section.sectionId}`, 3);
    }
    ids.add(section.sectionId);
    if (section.contextKey !== null) {
      if (keys.has(section.contextKey)) {
        throw new AppError("metaskill_duplicate_context_key", `duplicate context key: ${section.contextKey}`, 3);
      }
      keys.add(section.contextKey);
    }
  }
  for (const section of sections) {
    if (!ids.has(section.deliverySectionId)) {
      throw new AppError(
        "metaskill_missing_delivery_section",
        `${section.sectionId} references missing delivery ${section.deliverySectionId}`,
        3
      );
    }
  }
}

function assertStorageLimits(sourceMarkdown: string, sections: MetaskillSection[]): void {
  if (Buffer.byteLength(sourceMarkdown, "utf8") > MEDIUMTEXT_MAX_BYTES) {
    throw new AppError("metaskill_document_too_large", "metaskill document exceeds MEDIUMTEXT", 3);
  }
  for (const section of sections) {
    for (const value of [section.directMarkdown, section.deliveryMarkdown, section.retrievalText]) {
      if (Buffer.byteLength(value, "utf8") > MEDIUMTEXT_MAX_BYTES) {
        throw new AppError(
          "metaskill_section_too_large",
          `metaskill section exceeds MEDIUMTEXT: ${section.sectionId}`,
          3
        );
      }
    }
  }
}

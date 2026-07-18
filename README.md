# mycontext-mcp

`mycontext-mcp` は、Notion とローカル Markdown に置いている個人コンテキストを AI クライアントから読めるようにするための小さな同期基盤です。

Notion の対象ページを Markdown として TiDB に保存し、Cloudflare Workers 上の Remote MCP server から読み取り専用で公開します。Obsidian へは必要に応じてローカルで Markdown export します。

## 全体像

```text
Notion pages
  -> mycontext-sync
  -> TiDB notion_pages
noteAI editor knowledge Markdown
  -> mycontext-sync
  -> TiDB editor_knowledge_documents
Claude skill business knowledge Markdown (fixed 2 files)
  -> mycontext-sync section-aware parser
  -> TiDB business_knowledge_documents + business_knowledge_sections
noteAI author-style Markdown (fixed title/body files)
  -> mycontext-sync semantic parser + routing manifest
  -> TiDB author_style_documents + revisions + sections
Kindle Metaskill transcription (fixed 1 file)
  -> mycontext-sync semantic parser + topic routing manifest
  -> TiDB metaskill_documents + revisions + sections
TiDB context tables
  -> mycontext-mcp-worker
  -> MCP tools + context packs + section Resources
  -> MCP clients

TiDB notion_pages
  -> mycontext-sync export-obsidian
  -> Obsidian _notion_pages/
```

このプロジェクトは「Notion 全体を検索できる巨大な RAG」ではなく、必要なページと固定ローカルMarkdownだけを同期する設計です。Notionとeditor knowledgeは1文書1行で保存し、business knowledge・author style・Metaskillは文字数ではなく原文の意味境界で保存します。embedding、ローカル MCP server、Worker 側の Notion API 呼び出しは持ちません。

## コンポーネント

| Path | 役割 |
| --- | --- |
| `mycontext-sync/` | Notionと固定ローカルコーパスを用途別テーブルへ保存する TypeScript CLI。TiDB から Obsidian へ Notion Markdownをexportするコマンドも持つ。 |
| `mycontext-mcp-worker/` | TiDB の文書、意味section、選択式context packを公開する Cloudflare Workers Remote MCP server。既存 `/mcp` はOAuth 2.1保護、`/healthz` は公開liveness endpoint。 |
| `docs/` | 記事企画や運用メモなど、プロジェクト横断の資料。 |

## 個人利用と公開repoの分離

個人の Notion pageId/title、ローカルMarkdown同期元の絶対パス、Notion API key、TiDB credentials、OAuth secretsは公開repoに入れません。ローカルでは `mycontext-sync/.env` の `MIRROR_CONFIG_JSON` / `EDITOR_KNOWLEDGE_SOURCE_ROOT` / `BUSINESS_KNOWLEDGE_SOURCE_ROOT` / `AUTHOR_STYLE_SOURCE_ROOT` / `METASKILL_SOURCE_ROOT` と、Worker用の `.dev.vars` / Wrangler secrets で管理します。

詳細は [docs/personal-use.md](docs/personal-use.md) を参照してください。push前には次を実行できます。

```bash
./scripts/check-public-safety.sh
```

## データモデル

保存先は用途別の10テーブルです。

```sql
notion_pages(
  page_id,
  title,
  markdown,
  markdown_sha256,
  truncated,
  unknown_block_ids,
  last_synced_at,
  created_at,
  updated_at
)

editor_knowledge_documents(
  document_id,
  title,
  markdown,
  markdown_sha256,
  last_synced_at,
  created_at,
  updated_at
)

business_knowledge_documents(
  document_id,
  title,
  markdown,
  markdown_sha256,
  section_revision_sha256,
  section_count,
  search_span_count,
  outline_json,
  routing_metadata_json,
  last_synced_at,
  created_at,
  updated_at
)

business_knowledge_sections(
  document_id,
  section_id,
  section_revision_sha256,
  parent_section_id,
  delivery_section_id,
  title,
  heading_path_json,
  direct_markdown,
  section_markdown,
  retrieval_text,
  source_line_start,
  source_line_end,
  is_searchable
)

author_style_documents(
  document_id,
  author_key,
  style_scope,
  active_revision_sha256,
  status
)

author_style_revisions(
  document_id,
  revision_sha256,
  source_markdown,
  routing_manifest_json,
  section_count,
  delivery_section_count,
  search_span_count
)

author_style_sections(
  document_id,
  revision_sha256,
  section_id,
  context_key,
  delivery_section_id,
  content_layer,
  direct_markdown,
  delivery_markdown,
  retrieval_text
)

metaskill_documents(
  document_id,
  display_name,
  active_revision_sha256,
  status
)

metaskill_revisions(
  document_id,
  revision_sha256,
  source_markdown,
  routing_manifest_json,
  section_count,
  delivery_section_count,
  search_span_count
)

metaskill_sections(
  document_id,
  revision_sha256,
  section_id,
  context_key,
  delivery_section_id,
  content_layer,
  direct_markdown,
  delivery_markdown,
  retrieval_text
)
```

`markdown_sha256` で内容差分を判定し、変更がない文書は同期時にskipできます。Business sectionはsource hashとparser/sectioning versionからrevisionを作り、過去revisionを削除せずにUPSERTします。`unknown_block_ids` と `truncated` は、Notion ブロック変換時の警告や制限を後から追えるように残します。

## 同期の流れ

1. `mycontext-sync/.env` の `MIRROR_CONFIG_JSON`、または gitignored な `mirror.config.json` に seed page を設定する。
2. `pnpm migrate` で `notion_pages` と `editor_knowledge_documents` を作る。
3. `pnpm pull` で Notion から Markdown を取得し、TiDB に upsert する。
4. `pull` は seed page 配下の `child_page` と `link_to_page` を最大 200 ページまで探索する。
5. `.env` の `EDITOR_KNOWLEDGE_SOURCE_ROOT` を設定し、`pnpm pull-editor-knowledge` で固定8件を差分同期する。
6. `pnpm doctor-editor-knowledge` でローカルMarkdownとTiDBのハッシュ一致を検証する。
7. `.env` の `BUSINESS_KNOWLEDGE_SOURCE_ROOT` を設定し、`pnpm migrate-business-knowledge`で専用2テーブルだけを作成する。
8. `pnpm pull-business-knowledge`で固定2文書をsection-aware同期し、`pnpm doctor-business-knowledge`で原文・section revision・件数・hashを検証する。
9. `.env` の `AUTHOR_STYLE_SOURCE_ROOT` を設定し、`pnpm migrate-author-style`、`pnpm pull-author-style`、`pnpm doctor-author-style`で固定2文書と全routing組合せを検証する。
10. `.env` の `METASKILL_SOURCE_ROOT` を設定し、`pnpm migrate-metaskill`、`pnpm pull-metaskill`、`pnpm doctor-metaskill`で固定1文書・意味section・全topic routingを検証する。
11. `pnpm run search` でNotion Markdownをローカル検証できる。
12. 必要に応じて `pnpm export-obsidian` で Obsidian vault の `_notion_pages/` に Markdown を書き出す。

Obsidian export は Notion API を呼びません。TiDB に保存済みの内容をローカルファイルへ反映するだけです。

## Remote MCP

`mycontext-mcp-worker` は Cloudflare Workers 上で動く読み取り専用 MCP server です。

公開 endpoint:

- `GET /healthz`: `ok` を返す liveness endpoint。
- `/mcp`: OAuth 2.1 で保護された Streamable HTTP MCP endpoint。クライアント登録は DCR、認可コードは S256 PKCE を使う。
- 本人確認は GitHub OAuth で行い、`GITHUB_ALLOWED_USER_ID` に設定した不変の数値 user ID だけを許可する。

提供 tools:

- `list_documents`: 同期済みNotion / `editor-knowledge` / `business-knowledge`文書一覧を名前空間付きIDで返す。
- `search_context`: Notion/editor本文とbusinessの最小意味sectionを統合検索する。BusinessのH3ヒットは意味が完結するH2親sectionへ展開して返す。
- `search_text`: `search_context` と同じ検索を明示的な text fallback として提供する。
- `get_document`: 従来の`pageId`、名前空間付き`documentId`、またはbusiness `sectionId`で本文/sectionを返す。
- `health_check`: TiDB接続、各sourceの文書件数、business section件数、合計件数を返す。
- `get_author_style_context`: 文書種別・操作・モード・長さ・profileに応じた意味完結sectionを、通常利用向けの1パックとして返す。
- `search_author_style_evidence`: 根拠確認時だけevidence/profile/ops層を検索し、ヒットした細粒度spanを意味完結sectionへ展開して返す。
- `get_metaskill_context`: topic・intent・depthに応じた意味完結sectionを、通常利用向けの1パックとして返す。
- `search_metaskill_evidence`: 用語・例・promptなどを細粒度spanで検索し、ヒットを意味完結sectionへ展開して返す。

Business knowledge、author style、Metaskillは文書Resourceとsection Resource templateも公開します。MetaskillのURIは`mycontext://metaskill/ai-self-strategy`です。

Worker は stateless です。Durable Objects、migrations、raw SQL tool、Notion API 呼び出しはありません。

## セットアップ

### Notion -> TiDB sync

```bash
cd mycontext-sync
pnpm install
cp .env.example .env
pnpm migrate
pnpm pull
pnpm doctor
pnpm pull-editor-knowledge
pnpm doctor-editor-knowledge
pnpm migrate-business-knowledge
pnpm pull-business-knowledge
pnpm doctor-business-knowledge
pnpm migrate-author-style
pnpm pull-author-style
pnpm doctor-author-style
pnpm migrate-metaskill
pnpm pull-metaskill
pnpm doctor-metaskill
```

`.env` には Notion integration secret、TiDB接続情報、必要なら`MIRROR_CONFIG_JSON`のNotion pageId/title、各`*_SOURCE_ROOT`の絶対パスを入れます。実値はcommitしません。`mirror.config.json`を使う場合もgitignoredなローカルファイルとして扱います。

検索:

```bash
pnpm run search -- --query "検索したい語句" --top-k 5
```

`pnpm search` は pnpm registry search なので使いません。

Obsidian export:

```bash
pnpm export-obsidian
```

既定の出力先は macOS の iCloud Obsidian vault を想定しています。

```text
~/Library/Mobile Documents/iCloud~md~obsidian/Documents/_notion_pages
```

週次 export は launchd などから次の script を呼び出して実行できます。

```text
mycontext-sync/scripts/run-obsidian-sync.sh
```

この作業環境では月曜 04:00 ローカル時刻に実行する LaunchAgent で運用しています。公開リポジトリには個人環境の plist は含めません。

### Remote MCP Worker

```bash
cd mycontext-mcp-worker
pnpm install
wrangler secret put TIDB_DATABASE_URL
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
wrangler secret put GITHUB_ALLOWED_USER_ID
pnpm run deploy
```

ローカル確認:

```bash
pnpm run dev
curl -i http://localhost:8787/healthz
curl -i http://localhost:8787/mcp
```

`/healthz` は `200 ok`、token なしの `/mcp` は `401` が期待値です。

## 開発チェック

各サブプロジェクトで実行します。

```bash
pnpm run typecheck
pnpm test
```

`mycontext-sync` では実データ確認として次も使います。

```bash
pnpm pull -- --dry-run
pnpm pull -- --reindex
pnpm doctor
pnpm pull-editor-knowledge -- --dry-run
pnpm pull-editor-knowledge -- --reindex
pnpm doctor-editor-knowledge
pnpm pull-business-knowledge -- --dry-run
pnpm pull-business-knowledge -- --reindex
pnpm doctor-business-knowledge
pnpm pull-author-style -- --dry-run
pnpm pull-author-style -- --reindex
pnpm doctor-author-style
```

## 設計判断

- 対象は `mirror.config.json` の seed page と、そこから辿れる child/link page に限定する。
- TiDBには用途別テーブルで全文Markdownを保存し、business knowledgeだけは著者定義section treeも保存する。文字数によるsection結合・分割はしない。
- Business検索は最小sectionで行い、AIへは`delivery_section_id`が示す意味完結した親sectionを返す（Small2Big）。
- Business同期は新規2テーブルと固定2文書IDだけへUPSERTし、`DELETE`/`TRUNCATE`/`DROP`を持たない。
- Author styleは3専用テーブルへ細粒度保存するが、AIにはWorkerが選択・結合した1コンテキストパックを返す。通常経路で全文や任意文字chunkを読ませない。
- Worker は read-only にする。書き込み、migration、Notion API 取得は CLI 側に閉じる。
- Obsidian は Worker から直接触らず、ローカル export と launchd で扱う。
- embedding や chunk table は、必要性が確認できるまで入れない。

この構成により、認証情報と書き込み権限を同期CLIに寄せ、外部公開する MCP endpoint は最小の読み取り面だけにできます。

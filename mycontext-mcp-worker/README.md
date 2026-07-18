# mycontext-mcp-worker

Read-only Remote MCP server for synced Notion, editor knowledge, sectioned
business knowledge, routed author-style context, and the Metaskill
transcription stored in TiDB Cloud.

This Worker exposes Streamable HTTP at `/mcp` and a public non-secret liveness
endpoint at `/healthz`.

## Design

- Runtime: Cloudflare Workers with `nodejs_compat` for the `agents/mcp` bundle.
- MCP transport: stateless `createMcpHandler()` from `agents/mcp`.
- OAuth state: Cloudflare Workers KV. No Durable Objects, no `McpAgent`, no migrations.
- Database: TiDB Cloud Serverless Driver over HTTP via `@tidbcloud/serverless`;
  no TCP/mysql2 connection is used.
- Data access: read-only SQL against `notion_pages`,
  `editor_knowledge_documents`, `business_knowledge_documents`, and
  `business_knowledge_sections`, plus the three dedicated `author_style_*`
  and three dedicated `metaskill_*` tables. Full general documents use a fixed
  Worker-side `UNION ALL` read model; author style and Metaskill remain on
  dedicated retrieval paths.
- Search:
  - `search_context`: plain-text LIKE search over full Notion/editor Markdown;
    business knowledge searches the smallest semantic spans and expands each
    hit to its complete delivery section (Small2Big).
  - `search_text`: explicit LIKE fallback alias for exact terms and debugging.
- Auth: OAuth 2.1 authorization code flow with S256 PKCE. Cloudflare's OAuth
  provider issues and validates MCP access and refresh tokens.
- Identity: GitHub OAuth is used only to authenticate the resource owner. Access
  is restricted to the immutable numeric GitHub user ID in
  `GITHUB_ALLOWED_USER_ID`; the upstream GitHub token is not persisted.
- Discovery: RFC 8414 authorization-server metadata, RFC 9728 protected-resource
  metadata (including the path-aware `/mcp` document), and standard dynamic
  client registration (DCR). CIMD is intentionally disabled so clients use the
  broadly compatible public-client + PKCE flow.
- Scope: all tools require `context:read` and are marked read-only.
- `/healthz`: public and returns only `ok`.

The Worker does not call the Notion API, does not read or write Obsidian files,
does not run migrations, and does not expose a raw SQL tool.

## Tools

- `list_documents`
- `search_context`
- `search_text`
- `get_document`
- `health_check`
- `get_author_style_context`: normal generation/edit/evaluation path; returns
  one selector-specific context pack without truncating semantic sections.
- `search_author_style_evidence`: audit path over evidence/profile/ops layers;
  matched spans expand to complete delivery sections.
- `get_metaskill_context`: normal topic/intent/depth path; returns one complete
  context pack without truncating selected semantic sections.
- `search_metaskill_evidence`: fine-grained search path for terms, examples,
  prompts, and supporting passages; hits expand to complete delivery sections.

Document IDs are namespaced as `notion:<page-id>` and
`editor-knowledge:<document-id>` or `business-knowledge:<document-id>`.
`get_document` accepts exactly one of the legacy Notion-only `pageId`, unified
`documentId`, or semantic `sectionId` in
`business-knowledge:<document-id>#<local-section-id>` format.

## Resources

The two source documents are available at:

```text
mycontext://business-knowledge/startup-science
mycontext://business-knowledge/marketing-wisdom
```

Active semantic sections use this template:

```text
mycontext://business-knowledge/{documentId}/sections/{sectionId}
```

Search results retain text and structured output, and business hits also carry
an embedded Markdown resource plus a resource link. Only section rows whose
`section_revision_sha256` matches the owning document are visible. Business
results and resources expose `source_kind`, `ingest_scope`,
`source_declared_at`, `detail_available`, content layers, freshness, and any
relative `related_source_path`, so an index-only source is not mistaken for
stored detail.

`health_check` counts actual active-revision section rows and actual searchable
rows. It does not trust the document-level declared counts; inability to read
the section table therefore reports `db: "error"`.

Author-style full-source audit resources are available at:

```text
mycontext://author-style/ore-title-style
mycontext://author-style/ore-body-style
mycontext://author-style/{documentId}/sections/{sectionId}
```

Normal AI work should call `get_author_style_context`; full-source Resources
exist for audit and maintenance. The tool emits the context Markdown once in
MCP text content while structured content contains metadata only.

Metaskill full-source and semantic-section resources are available at:

```text
mycontext://metaskill/ai-self-strategy
mycontext://metaskill/{documentId}/sections/{sectionId}
```

Normal AI work should call `get_metaskill_context`. Prompt and example blocks
are returned as delimited reference material, not as caller instructions.

The TiDB reader used by `TIDB_DATABASE_URL` needs `SELECT` on all context tables:

```sql
GRANT SELECT ON notion_context.editor_knowledge_documents TO '<reader-user>'@'%';
GRANT SELECT ON notion_context.business_knowledge_documents TO '<reader-user>'@'%';
GRANT SELECT ON notion_context.business_knowledge_sections TO '<reader-user>'@'%';
GRANT SELECT ON notion_context.author_style_documents TO '<reader-user>'@'%';
GRANT SELECT ON notion_context.author_style_revisions TO '<reader-user>'@'%';
GRANT SELECT ON notion_context.author_style_sections TO '<reader-user>'@'%';
GRANT SELECT ON notion_context.metaskill_documents TO '<reader-user>'@'%';
GRANT SELECT ON notion_context.metaskill_revisions TO '<reader-user>'@'%';
GRANT SELECT ON notion_context.metaskill_sections TO '<reader-user>'@'%';
```

## Environment

Local development uses `.dev.vars` and production should use Wrangler secrets.
Do not commit real values.

```bash
TIDB_DATABASE_URL=mysql://<user>:<password>@<host>/<database>
GITHUB_CLIENT_ID=<github-oauth-app-client-id>
GITHUB_CLIENT_SECRET=<github-oauth-app-client-secret>
GITHUB_ALLOWED_USER_ID=<numeric-github-user-id>
```

If real credentials were ever shared in prompts, attachments, logs, or committed
files, rotate the TiDB password and OAuth app secret before using this endpoint
in production.

## Deploy

```bash
pnpm install

wrangler secret put TIDB_DATABASE_URL
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
wrangler secret put GITHUB_ALLOWED_USER_ID

pnpm run deploy
```

This publishes to the Worker URL assigned by Cloudflare. A custom domain is not
configured in `wrangler.jsonc`.

## Local Dev

```bash
pnpm install
pnpm run dev
```

Verify:

```bash
curl -i http://localhost:8787/healthz
curl -i http://localhost:8787/mcp
```

The first command should return `200 ok`; the second should return `401` with a
`WWW-Authenticate` header pointing to protected-resource metadata.

Register the same standard endpoint in ChatGPT Web, Codex, and Claude Code:

```text
https://mycontext-mcp.servicedake.workers.dev/mcp
```

The client discovers OAuth automatically. The GitHub OAuth App callback URL is:

```text
https://mycontext-mcp.servicedake.workers.dev/oauth/github/callback
```

## Development Checks

```bash
pnpm run typecheck
pnpm test
pnpm run test:live-author-style
pnpm run test:live-metaskill
```

The live author-style smoke test uses the read-only `TIDB_DATABASE_URL` from
`.dev.vars`, lists both MCP tools through an in-memory MCP transport, and calls
title context, body context, and evidence search against current TiDB data.
The live Metaskill test similarly lists both dedicated tools, calls context and
evidence retrieval, and reads document/section resources against current TiDB
data.

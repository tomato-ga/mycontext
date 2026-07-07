# mycontext-mcp-worker

Read-only Remote MCP server for synced Notion context stored in TiDB Cloud.

This Worker exposes Streamable HTTP at `/mcp` and a public non-secret liveness
endpoint at `/healthz`.

## Design

- Runtime: Cloudflare Workers with `nodejs_compat` for the `agents/mcp` bundle.
- MCP transport: stateless `createMcpHandler()` from `agents/mcp`.
- State: none. No Durable Objects, no `McpAgent`, no migrations.
- Database: TiDB Cloud Serverless Driver over HTTP via `@tidbcloud/serverless`;
  no TCP/mysql2 connection is used.
- Data access: read-only SQL against `notion_pages`.
- Search:
  - `search_context`: plain-text LIKE search over full page Markdown.
  - `search_text`: explicit LIKE fallback alias for exact terms and debugging.
- Auth: `Authorization: Bearer $MCP_ACCESS_TOKEN` is required for `/mcp`.
- `/healthz`: public and returns only `ok`.

The Worker does not call the Notion API, does not read or write Obsidian files,
does not run migrations, and does not expose a raw SQL tool.

## Tools

- `list_documents`
- `search_context`
- `search_text`
- `get_document`
- `health_check`

## Environment

Local development uses `.dev.vars` and production should use Wrangler secrets.
Do not commit real values.

```bash
TIDB_DATABASE_URL=mysql://<user>:<password>@<host>/<database>
MCP_ACCESS_TOKEN=<remote-mcp-token>
```

If real credentials were ever shared in prompts, attachments, logs, or committed
files, rotate the TiDB password and MCP access token before using this endpoint
in production.

## Deploy

```bash
pnpm install

wrangler secret put TIDB_DATABASE_URL
wrangler secret put MCP_ACCESS_TOKEN

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

The first command should return `200 ok`; the second should return `401` unless
the bearer token is supplied.

## Development Checks

```bash
pnpm run typecheck
pnpm test
```

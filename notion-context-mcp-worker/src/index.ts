import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpHandler } from "agents/mcp";
import { isAuthorized } from "./auth.js";
import { ConfigError, loadConfig, type AppConfig, type Env } from "./config.js";
import { jsonResponse, withSecurityHeaders } from "./http.js";
import { createTidbClient } from "./tidb.js";
import { registerGetDocumentTool } from "./tools/getDocument.js";
import { registerHealthCheckTool } from "./tools/healthCheck.js";
import { registerListDocumentsTool } from "./tools/listDocuments.js";
import { registerSearchContextTool } from "./tools/searchContext.js";
import { registerSearchTextTool } from "./tools/searchText.js";

const MCP_ROUTE = "/mcp";

function createServer(config: AppConfig): McpServer {
  const server = new McpServer({ name: "notion-context-mcp", version: "0.2.0" });
  const client = createTidbClient(config.tidbDatabaseUrl);

  registerListDocumentsTool(server, client);
  registerSearchContextTool(server, client);
  registerSearchTextTool(server, client);
  registerGetDocumentTool(server, client);
  registerHealthCheckTool(server, client);

  return server;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/healthz") {
      return withSecurityHeaders(new Response("ok", {
        status: 200,
        headers: { "content-type": "text/plain; charset=utf-8" }
      }));
    }

    if (url.pathname === MCP_ROUTE) {
      let config: AppConfig;
      try {
        config = loadConfig(env);
      } catch (error) {
        if (error instanceof ConfigError) {
          return jsonResponse({ error: "server_misconfigured" }, 500);
        }
        throw error;
      }

      if (!isAuthorized(request.headers.get("Authorization"), config.mcpAccessToken)) {
        return jsonResponse({ error: "unauthorized" }, 401);
      }

      const server = createServer(config);
      const response = await createMcpHandler(server, { route: MCP_ROUTE })(request, env, ctx);
      return withSecurityHeaders(response);
    }

    return withSecurityHeaders(new Response("Not found", { status: 404 }));
  }
};

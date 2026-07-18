import { OAuthProvider } from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpHandler } from "agents/mcp";
import { MCP_RESOURCE, MCP_ROUTE, MCP_SCOPE, PUBLIC_ORIGIN } from "./constants.js";
import { ConfigError, loadConfig, type AppConfig, type Env } from "./config.js";
import { jsonResponse, withSecurityHeaders } from "./http.js";
import { withOpenAiToolDescriptors } from "./mcpCompatibility.js";
import { defaultHandler } from "./oauth.js";
import { registerBusinessKnowledgeResources } from "./resources/businessKnowledge.js";
import { registerAuthorStyleResources } from "./resources/authorStyle.js";
import { registerMetaskillResources } from "./resources/metaskill.js";
import { createTidbClient } from "./tidb.js";
import { registerGetDocumentTool } from "./tools/getDocument.js";
import { registerHealthCheckTool } from "./tools/healthCheck.js";
import { registerListDocumentsTool } from "./tools/listDocuments.js";
import { registerSearchContextTool } from "./tools/searchContext.js";
import { registerSearchTextTool } from "./tools/searchText.js";
import { registerGetAuthorStyleContextTool } from "./tools/getAuthorStyleContext.js";
import { registerSearchAuthorStyleEvidenceTool } from "./tools/searchAuthorStyleEvidence.js";
import { registerGetMetaskillContextTool } from "./tools/getMetaskillContext.js";
import { registerSearchMetaskillEvidenceTool } from "./tools/searchMetaskillEvidence.js";

function createServer(config: AppConfig): McpServer {
  const server = new McpServer({ name: "mycontext-mcp", version: "0.4.0" });
  const client = createTidbClient(config.tidbDatabaseUrl);

  registerListDocumentsTool(server, client);
  registerSearchContextTool(server, client);
  registerSearchTextTool(server, client);
  registerGetDocumentTool(server, client);
  registerHealthCheckTool(server, client);
  registerGetAuthorStyleContextTool(server, client);
  registerSearchAuthorStyleEvidenceTool(server, client);
  registerGetMetaskillContextTool(server, client);
  registerSearchMetaskillEvidenceTool(server, client);
  registerBusinessKnowledgeResources(server, client);
  registerAuthorStyleResources(server, client);
  registerMetaskillResources(server, client);

  return server;
}

const apiHandler = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    let config: AppConfig;
    try {
      config = loadConfig(env);
    } catch (error) {
      if (error instanceof ConfigError) {
        return jsonResponse({ error: "server_misconfigured" }, 500);
      }
      throw error;
    }

    const server = createServer(config);
    const response = await createMcpHandler(server, {
      route: MCP_ROUTE,
      enableJsonResponse: true
    })(request, env, ctx);
    return withSecurityHeaders(await withOpenAiToolDescriptors(response));
  }
};

const oauthProvider = new OAuthProvider<Env>({
  apiRoute: MCP_ROUTE,
  apiHandler,
  defaultHandler,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/oauth/token",
  clientRegistrationEndpoint: "/oauth/register",
  scopesSupported: [MCP_SCOPE],
  allowImplicitFlow: false,
  allowPlainPKCE: false,
  allowTokenExchangeGrant: false,
  disallowPublicClientRegistration: false,
  accessTokenTTL: 3600,
  refreshTokenTTL: 60 * 60 * 24 * 30,
  clientRegistrationTTL: 60 * 60 * 24 * 90,
  resourceMetadata: {
    resource: MCP_RESOURCE,
    authorization_servers: [PUBLIC_ORIGIN],
    scopes_supported: [MCP_SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: "mycontext-mcp"
  },
  onError(error) {
    console.error("oauth_provider_error", error.code, error.status);
  }
});

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return withSecurityHeaders(await oauthProvider.fetch(request, env, ctx));
  },

  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    const result = await oauthProvider.purgeExpiredData(env, { batchSize: 100 });
    console.log("oauth_kv_purge", result);
  }
} satisfies ExportedHandler<Env>;

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { EMPTY_PERSONAL_SYNONYM_CONFIG, type PersonalSynonymConfig } from "../searchQuery.js";
import type { TidbClient } from "../tidb.js";
import { registerGetAuthorStyleContextTool } from "./getAuthorStyleContext.js";
import { registerGetMetaskillContextTool } from "./getMetaskillContext.js";
import { registerReadContextTool } from "./readContext.js";
import { registerSearchAuthorStyleEvidenceTool } from "./searchAuthorStyleEvidence.js";
import { registerSearchContextTool } from "./searchContext.js";
import { registerSearchMetaskillEvidenceTool } from "./searchMetaskillEvidence.js";

export function registerPublicTools(
  server: McpServer,
  client: TidbClient,
  personalSynonyms: PersonalSynonymConfig = EMPTY_PERSONAL_SYNONYM_CONFIG
): void {
  registerSearchContextTool(server, client, personalSynonyms);
  registerReadContextTool(server, client);
  registerGetAuthorStyleContextTool(server, client);
  registerSearchAuthorStyleEvidenceTool(server, client);
  registerGetMetaskillContextTool(server, client);
  registerSearchMetaskillEvidenceTool(server, client);
}

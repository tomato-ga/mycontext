import { z } from "zod";

export interface Env {
  TIDB_DATABASE_URL: string;
  NOTION_API_TOKEN: string;
  NOTION_DATA_SOURCE_ID: string;
  NOTION_WEBHOOK_BOOTSTRAP_SECRET: string;
  NOTION_WEBHOOK_VERIFICATION_TOKEN?: string;
  SYNC_QUEUE: Queue<import("./types.js").SyncMessage>;
}

export interface SyncConfig {
  tidbDatabaseUrl: string;
  notionApiToken: string;
  notionDataSourceId: string;
  notionWebhookBootstrapSecret: string;
  notionWebhookVerificationToken?: string;
}

const required = z.string().trim().min(1);

const schema = z.object({
  TIDB_DATABASE_URL: required,
  NOTION_API_TOKEN: required,
  NOTION_DATA_SOURCE_ID: required,
  NOTION_WEBHOOK_BOOTSTRAP_SECRET: required,
  NOTION_WEBHOOK_VERIFICATION_TOKEN: required.optional()
});

export function loadConfig(env: Env): SyncConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))].sort();
    throw new Error(`Missing or invalid environment variable(s): ${names.join(", ")}`);
  }
  return {
    tidbDatabaseUrl: parsed.data.TIDB_DATABASE_URL,
    notionApiToken: parsed.data.NOTION_API_TOKEN,
    notionDataSourceId: parsed.data.NOTION_DATA_SOURCE_ID,
    notionWebhookBootstrapSecret: parsed.data.NOTION_WEBHOOK_BOOTSTRAP_SECRET,
    ...(parsed.data.NOTION_WEBHOOK_VERIFICATION_TOKEN === undefined
      ? {}
      : { notionWebhookVerificationToken: parsed.data.NOTION_WEBHOOK_VERIFICATION_TOKEN })
  };
}

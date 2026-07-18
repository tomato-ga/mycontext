import path from "node:path";
import { createTidbClientFromEnv } from "../tidb.js";
import { toAppError, type CliFlags } from "../types.js";

export async function runMigrateBusinessKnowledge(_flags: CliFlags): Promise<void> {
  const client = createTidbClientFromEnv();
  try {
    const statements = await client.applySchema(path.resolve("business-knowledge-schema.sql"));
    console.log(JSON.stringify({
      status: "ok",
      scope: "business_knowledge_only",
      statements
    }, null, 2));
  } catch (error) {
    throw toAppError(
      error,
      "migrate_business_knowledge_failed",
      "business knowledge migration failed",
      3
    );
  } finally {
    await client.close();
  }
}

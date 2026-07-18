import path from "node:path";
import { createTidbClientFromEnv } from "../tidb.js";
import { toAppError, type CliFlags } from "../types.js";

export async function runMigrateMetaskill(_flags: CliFlags): Promise<void> {
  const client = createTidbClientFromEnv();
  try {
    const statements = await client.applySchema(path.resolve("metaskill-schema.sql"));
    console.log(JSON.stringify({ status: "ok", scope: "metaskill_only", statements }, null, 2));
  } catch (error) {
    throw toAppError(error, "migrate_metaskill_failed", "metaskill migration failed", 3);
  } finally {
    await client.close();
  }
}

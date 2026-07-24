import { fileURLToPath } from "node:url";
import { createTidbClientFromEnv } from "../tidb.js";
import { toAppError, type CliFlags } from "../types.js";

const SCHEMA_PATH = fileURLToPath(
  new URL("../../../mycontext-sync-worker/sync-state-log-schema.sql", import.meta.url)
);

export async function runMigrateSyncStateLog(_flags: CliFlags): Promise<void> {
  const client = createTidbClientFromEnv();
  try {
    const statements = await client.applySchema(SCHEMA_PATH);
    console.log(JSON.stringify({
      status: "ok",
      scope: "context_sync_state_log_only",
      statements
    }, null, 2));
  } catch (error) {
    throw toAppError(error, "migrate_sync_state_log_failed", "sync state log migration failed", 3);
  } finally {
    await client.close();
  }
}

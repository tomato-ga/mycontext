import { createTidbClientFromEnv } from "../tidb.js";
import { toAppError, type CliFlags } from "../types.js";

export async function runAuditSyncState(flags: CliFlags): Promise<void> {
  const client = createTidbClientFromEnv();
  try {
    const rows = await client.getSyncStateLog(flags.documentId);
    console.log(JSON.stringify({
      status: "ok",
      documentId: flags.documentId ?? null,
      rows
    }, null, 2));
  } catch (error) {
    throw toAppError(error, "audit_sync_state_failed", "sync state audit failed", 3);
  } finally {
    await client.close();
  }
}

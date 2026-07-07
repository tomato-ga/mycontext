import path from "node:path";
import { createDatabaseIfMissing, TidbClient, tidbOptionsFromEnv } from "../tidb.js";
import { toAppError, type CliFlags } from "../types.js";

export async function runMigrate(_flags: CliFlags): Promise<void> {
  const options = tidbOptionsFromEnv();
  let client: TidbClient | null = null;
  try {
    client = new TidbClient(options);
    let statements: number;
    try {
      statements = await client.applySchema(path.resolve("schema.sql"));
    } catch (error) {
      if (!isUnknownDatabaseError(error)) {
        throw error;
      }
      await client.close();
      client = null;
      await createDatabaseIfMissing(options);
      client = new TidbClient(options);
      statements = await client.applySchema(path.resolve("schema.sql"));
    }
    console.log(JSON.stringify({ status: "ok", statements }, null, 2));
  } catch (error) {
    throw toAppError(error, "migrate_failed", "migration failed", 3);
  } finally {
    await client?.close();
  }
}

function isUnknownDatabaseError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ER_BAD_DB_ERROR"
  );
}

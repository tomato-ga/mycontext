import path from "node:path";
import { createTidbClientFromEnv } from "../tidb.js";
import { AppError, toAppError, type CliFlags } from "../types.js";

export async function runMigrateEditorKnowledge(_flags: CliFlags): Promise<void> {
  const client = createTidbClientFromEnv();
  try {
    // Read-only pre-flight: verify the live schema is in a state the additive-only migration
    // can safely run against, and never touch any pre-existing editor_knowledge_documents row
    // (overview, lesson-01..07). See inspectEditorKnowledgeSchemaGuard for what this checks.
    const guard = await client.inspectEditorKnowledgeSchemaGuard();
    if (guard.columnTypeConflicts.length > 0) {
      throw new AppError(
        "migrate_editor_knowledge_guard_failed",
        `refusing to migrate: existing column(s) do not match the expected type, which ` +
          `"ADD COLUMN IF NOT EXISTS" would silently skip rather than fix: ` +
          guard.columnTypeConflicts
            .map((conflict) => `${conflict.column} is ${conflict.actualDataType}, expected ${conflict.expectedDataType}`)
            .join("; "),
        3
      );
    }

    const statements = await client.applySchema(path.resolve("editor-knowledge-schema.sql"));

    console.log(JSON.stringify({
      status: "ok",
      scope: "editor_knowledge_only",
      preflight: {
        documentsTableExistedBefore: guard.documentsTableExists,
        preexistingDocumentRowCount: guard.preexistingDocumentRowCount,
        preexistingSectionColumns: guard.preexistingSectionColumns,
        sectionsTableAlreadyExisted: guard.sectionsTableAlreadyExists
      },
      statements
    }, null, 2));
  } catch (error) {
    throw toAppError(
      error,
      "migrate_editor_knowledge_failed",
      "editor knowledge migration failed",
      3
    );
  } finally {
    await client.close();
  }
}

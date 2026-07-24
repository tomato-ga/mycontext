import { loadEmergencyAuthorStyle } from "../emergencyAuthorStyle.js";
import { createTidbClientFromEnv } from "../tidb.js";
import { AppError, toAppError, type CliFlags } from "../types.js";

export async function runRestoreAuthorStyleMarkdown(flags: CliFlags): Promise<void> {
  const documentId = requiredFlag(flags.documentId, "--document-id");
  const inputPath = requiredFlag(flags.inputPath, "--input-path");
  const document = await loadEmergencyAuthorStyle({ inputPath, documentId });

  if (flags.dryRun) {
    console.log(JSON.stringify(summary(document, "dry_run"), null, 2));
    return;
  }
  if (!flags.activateEmergency) {
    throw new AppError(
      "emergency_activation_required",
      "refusing to modify TiDB without --activate-emergency; use --dry-run to validate only",
      3
    );
  }

  const client = createTidbClientFromEnv();
  try {
    await client.upsertAuthorStyleDocumentAndSections(document);
    console.log(JSON.stringify(summary(document, "activated"), null, 2));
  } catch (error) {
    throw toAppError(error, "restore_author_style_failed", "author-style restore failed", 3);
  } finally {
    await client.close();
  }
}

function summary(document: Awaited<ReturnType<typeof loadEmergencyAuthorStyle>>, status: string) {
  return {
    status,
    document_id: document.documentId,
    source_path_key: document.sourcePathKey,
    source_markdown_sha256: document.sourceMarkdownSha256,
    revision_sha256: document.revisionSha256,
    sections_total: document.sectionCount
  };
}

function requiredFlag(value: string | undefined, name: string): string {
  if (!value) throw new AppError("missing_flag", `${name} is required`, 3);
  return value;
}

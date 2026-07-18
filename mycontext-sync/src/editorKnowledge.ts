import fs from "node:fs/promises";
import path from "node:path";
import { requireEnv } from "./config.js";
import { sha256 } from "./hash.js";
import { AppError, type EditorKnowledgeDocumentId } from "./types.js";

export interface EditorKnowledgeSource {
  documentId: EditorKnowledgeDocumentId;
  relativePath: string;
}

export interface LoadedEditorKnowledgeDocument {
  documentId: EditorKnowledgeDocumentId;
  title: string;
  markdown: string;
  markdownSha256: string;
}

export const EDITOR_KNOWLEDGE_SOURCES: readonly EditorKnowledgeSource[] = [
  { documentId: "overview", relativePath: "knowledge/editor-training-knowledge.md" },
  { documentId: "lesson-01", relativePath: "knowledge/editor-training/01-web-media-basics.md" },
  { documentId: "lesson-02", relativePath: "knowledge/editor-training/02-editorial-thinking.md" },
  { documentId: "lesson-03", relativePath: "knowledge/editor-training/03-planning-and-ideation.md" },
  { documentId: "lesson-04", relativePath: "knowledge/editor-training/04-editorial-work.md" },
  { documentId: "lesson-05", relativePath: "knowledge/editor-training/05-editorial-skills.md" },
  { documentId: "lesson-06", relativePath: "knowledge/editor-training/06-editorial-meeting.md" },
  { documentId: "lesson-07", relativePath: "knowledge/editor-training/07-editor-in-chief.md" }
];

export function editorKnowledgeSourceRootFromEnv(): string {
  const sourceRoot = requireEnv("EDITOR_KNOWLEDGE_SOURCE_ROOT");
  if (!path.isAbsolute(sourceRoot)) {
    throw new AppError(
      "invalid_editor_knowledge_source_root",
      "EDITOR_KNOWLEDGE_SOURCE_ROOT must be an absolute path",
      3
    );
  }
  return path.resolve(sourceRoot);
}

export async function loadEditorKnowledgeDocument(
  sourceRoot: string,
  source: EditorKnowledgeSource
): Promise<LoadedEditorKnowledgeDocument> {
  const absoluteRoot = path.resolve(sourceRoot);
  const sourcePath = path.resolve(absoluteRoot, source.relativePath);
  if (!sourcePath.startsWith(`${absoluteRoot}${path.sep}`)) {
    throw new AppError(
      "editor_knowledge_path_escape",
      `source path escapes configured root for ${source.documentId}`,
      3
    );
  }

  let bytes: Buffer;
  try {
    bytes = await fs.readFile(sourcePath);
  } catch (error) {
    throw new AppError(
      "editor_knowledge_read_failed",
      `failed to read editor knowledge source: ${source.documentId}`,
      3,
      error
    );
  }

  let markdown: string;
  try {
    markdown = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
  } catch (error) {
    throw new AppError(
      "editor_knowledge_invalid_utf8",
      `editor knowledge source is not valid UTF-8: ${source.documentId}`,
      3,
      error
    );
  }

  if (markdown.trim().length === 0 || markdown.includes("\0")) {
    throw new AppError(
      "editor_knowledge_invalid_markdown",
      `editor knowledge source is empty or contains NUL: ${source.documentId}`,
      3
    );
  }

  const title = extractMarkdownTitle(markdown, source.documentId);
  return {
    documentId: source.documentId,
    title,
    markdown,
    markdownSha256: sha256(markdown)
  };
}

function extractMarkdownTitle(markdown: string, documentId: EditorKnowledgeDocumentId): string {
  const firstLine = markdown.split(/\r?\n/, 1)[0]?.trim() ?? "";
  const match = /^#\s+(.+)$/.exec(firstLine);
  const title = match?.[1]?.trim() ?? "";
  if (title.length === 0) {
    throw new AppError(
      "editor_knowledge_title_missing",
      `editor knowledge source must start with an H1 title: ${documentId}`,
      3
    );
  }
  return title;
}

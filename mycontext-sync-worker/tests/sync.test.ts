import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LoadedAuthorStyleDocument } from "../../mycontext-sync/src/authorStyle.js";
import { sha256 } from "../src/hash.js";
import {
  canonicalAuthorStyleMarkdown,
  processSyncMessage,
  syncFingerprint
} from "../src/sync.js";
import type {
  AuthorStyleState,
  ManagedNotionDocument,
  NotionGateway,
  SyncMessage,
  SyncRepository
} from "../src/types.js";
import { SyncFailure } from "../src/types.js";

const pageId = "11111111-1111-1111-1111-111111111111";
const now = new Date("2026-07-22T12:00:00.000Z");

describe("Notion-managed context synchronization", () => {
  let notion: NotionGateway;
  let repository: SyncRepository;
  let currentManaged: ManagedNotionDocument;

  beforeEach(() => {
    currentManaged = managedDocument();
    notion = {
      getManagedDocument: vi.fn().mockImplementation(async () => ({ ...currentManaged })),
      getMarkdown: vi.fn().mockResolvedValue(markdown("# Profile\n\nBody")),
      updateWorkflow: vi.fn().mockImplementation(async (_pageId, update) => {
        currentManaged = {
          ...currentManaged,
          status: update.status,
          syncedHash: update.syncedHash === undefined
            ? currentManaged.syncedHash
            : update.syncedHash,
          activeRevision: update.activeRevision === undefined
            ? currentManaged.activeRevision
            : update.activeRevision
        };
      }),
      findByDocumentId: vi.fn()
    };
    vi.mocked(notion.findByDocumentId).mockImplementation(async () => [{ ...currentManaged }]);
    repository = {
      appendSyncStateLog: vi.fn(),
      syncNotionPage: vi.fn(),
      getAuthorStyleState: vi.fn().mockResolvedValue(null),
      activateAuthorStyle: vi.fn()
    };
  });

  it("syncs a Ready personal-context page and marks it Synced", async () => {
    const result = await processSyncMessage(message("page.properties_updated"), {
      notion,
      repository,
      now: () => now
    });

    expect(result.status).toBe("synced");
    expect(repository.syncNotionPage).toHaveBeenCalledWith(expect.objectContaining({
      pageId,
      originalPageId: null,
      title: "Profile",
      markdown: "# Profile\n\nBody"
    }));
    expect(notion.updateWorkflow).toHaveBeenNthCalledWith(1, pageId, {
      status: "Syncing",
      validationError: null
    });
    expect(notion.updateWorkflow).toHaveBeenLastCalledWith(pageId, expect.objectContaining({
      status: "Synced",
      syncedHash: syncFingerprint(managedDocument(), "# Profile\n\nBody"),
      lastSyncedAt: now.toISOString()
    }));
    expect(vi.mocked(repository.appendSyncStateLog).mock.calls.map(([entry]) => entry.state))
      .toEqual([
        "received",
        "eligible",
        "syncing",
        "source_verified",
        "content_validated",
        "persisted",
        "synced"
      ]);
  });

  it("syncs a Ready AI Skill through the generic Notion read model", async () => {
    currentManaged = managedDocument({
      documentId: "resolution-diagnose",
      name: "resolution-diagnose: 解像度診断",
      category: "AI Skill",
      schemaVersion: "ai-skill-v1"
    });

    const result = await processSyncMessage(message("page.properties_updated"), {
      notion,
      repository,
      now: () => now
    });

    expect(result.status).toBe("synced");
    expect(repository.syncNotionPage).toHaveBeenCalledWith(expect.objectContaining({
      pageId,
      title: "resolution-diagnose: 解像度診断"
    }));
  });

  it("keeps a Metaskill snapshot read-only when someone sets it Ready", async () => {
    currentManaged = managedDocument({
      documentId: "ai-self-strategy",
      name: "メタスキル — キャプチャ文字起こし",
      category: "Metaskill",
      schemaVersion: "metaskill-v1",
      syncSource: "TiDB"
    });

    const result = await processSyncMessage(message("page.properties_updated"), {
      notion,
      repository
    });

    expect(result).toMatchObject({ status: "failed", reason: "metaskill_snapshot_read_only" });
    expect(repository.syncNotionPage).not.toHaveBeenCalled();
    expect(notion.updateWorkflow).toHaveBeenLastCalledWith(pageId, expect.objectContaining({
      status: "Conflict"
    }));
  });

  it("surfaces an invalid Notion management schema on the page", async () => {
    vi.mocked(notion.getManagedDocument).mockRejectedValue(new SyncFailure(
      "notion_property_missing",
      "Document ID must not be empty"
    ));

    const result = await processSyncMessage(message("page.properties_updated"), {
      notion,
      repository
    });

    expect(result).toEqual({ pageId, status: "failed", reason: "notion_property_missing" });
    expect(notion.updateWorkflow).toHaveBeenCalledWith(pageId, expect.objectContaining({
      status: "Error",
      validationError: expect.stringContaining("Document ID")
    }));
  });

  it("ignores pages outside the configured data source without modifying them", async () => {
    vi.mocked(notion.getManagedDocument).mockRejectedValue(new SyncFailure(
      "notion_data_source_mismatch",
      "outside data source",
      { workflowStatus: "Conflict" }
    ));

    const result = await processSyncMessage(message("page.properties_updated"), {
      notion,
      repository
    });

    expect(result).toEqual({ pageId, status: "ignored", reason: "notion_data_source_mismatch" });
    expect(notion.updateWorkflow).not.toHaveBeenCalled();
  });

  it("ignores a self-generated property event when the Notion fingerprint is unchanged", async () => {
    currentManaged = managedDocument({
      status: "Synced",
      syncedHash: syncFingerprint(managedDocument(), "# Profile\n\nBody")
    });

    const result = await processSyncMessage(message("page.properties_updated"), {
      notion,
      repository
    });

    expect(result.status).toBe("ignored");
    expect(repository.syncNotionPage).not.toHaveBeenCalled();
  });

  it("reports Conflict when Document ID is duplicated", async () => {
    vi.mocked(notion.findByDocumentId).mockResolvedValue([
      managedDocument(),
      managedDocument({ pageId: "duplicate-page" })
    ]);

    const result = await processSyncMessage(message("page.properties_updated"), {
      notion,
      repository
    });

    expect(result).toMatchObject({ status: "failed", reason: "notion_document_id_duplicate" });
    expect(repository.syncNotionPage).not.toHaveBeenCalled();
    expect(notion.updateWorkflow).toHaveBeenLastCalledWith(pageId, expect.objectContaining({
      status: "Conflict"
    }));
  });

  it("resumes an idempotent retry from Syncing", async () => {
    currentManaged = managedDocument({ status: "Syncing" });

    const result = await processSyncMessage(message("page.properties_updated"), {
      notion,
      repository
    });

    expect(result.status).toBe("synced");
    expect(notion.updateWorkflow).not.toHaveBeenCalledWith(pageId, expect.objectContaining({
      status: "Syncing"
    }));
    expect(notion.updateWorkflow).toHaveBeenLastCalledWith(pageId, expect.objectContaining({
      status: "Synced"
    }));
  });

  it("activates a Notion revision when adopting an existing local author style", async () => {
    const sourceMarkdown = "# Style";
    const document = authorStyleDocument(sourceMarkdown, "new-revision");
    currentManaged = managedDocument({
      documentId: "ore-body-style",
      name: "Body style",
      category: "Author Style",
      schemaVersion: "author-style-v1"
    });
    vi.mocked(notion.getMarkdown).mockResolvedValue(markdown(sourceMarkdown));
    vi.mocked(repository.getAuthorStyleState).mockResolvedValue({
      activeRevisionSha256: "existing-revision",
      activeSourceMarkdownSha256: sha256("# Existing local style"),
      sourcePathKey: "knowledge/ore-body-style-analysis.md"
    } satisfies AuthorStyleState);

    const result = await processSyncMessage(message("page.properties_updated"), {
      notion,
      repository,
      parseAuthorStyle: () => document
    });

    expect(result).toMatchObject({ status: "synced", revisionSha256: "new-revision" });
    expect(repository.activateAuthorStyle).toHaveBeenCalledWith({
      document,
      notionPageId: pageId,
      expectedState: expect.objectContaining({ sourcePathKey: "knowledge/ore-body-style-analysis.md" })
    });
  });

  it("reports Conflict when another Notion page already owns an author style", async () => {
    const document = authorStyleDocument("# Notion style", "notion-revision");
    currentManaged = managedDocument({
      documentId: "ore-body-style",
      name: "Body style",
      category: "Author Style",
      schemaVersion: "author-style-v1"
    });
    vi.mocked(notion.getMarkdown).mockResolvedValue(markdown(document.sourceMarkdown));
    vi.mocked(repository.getAuthorStyleState).mockResolvedValue({
      activeRevisionSha256: "existing-revision",
      activeSourceMarkdownSha256: sha256("# Existing style"),
      sourcePathKey: "notion:another-page"
    });

    const result = await processSyncMessage(message("page.properties_updated"), {
      notion,
      repository,
      parseAuthorStyle: () => document
    });

    expect(result).toMatchObject({ status: "failed", reason: "author_style_owned_by_another_notion_page" });
    expect(repository.activateAuthorStyle).not.toHaveBeenCalled();
    expect(notion.updateWorkflow).toHaveBeenLastCalledWith(pageId, expect.objectContaining({
      status: "Conflict"
    }));
  });

  it("activates a changed author style after Notion already owns it", async () => {
    const document = authorStyleDocument("# Updated style", "updated-revision");
    const state: AuthorStyleState = {
      activeRevisionSha256: "old-revision",
      activeSourceMarkdownSha256: sha256("# Old style"),
      sourcePathKey: `notion:${pageId}`
    };
    currentManaged = managedDocument({
      documentId: "ore-body-style",
      name: "Body style",
      category: "Author Style",
      schemaVersion: "author-style-v1"
    });
    vi.mocked(notion.getMarkdown).mockResolvedValue(markdown(document.sourceMarkdown));
    vi.mocked(repository.getAuthorStyleState).mockResolvedValue(state);

    const result = await processSyncMessage(message("page.properties_updated"), {
      notion,
      repository,
      parseAuthorStyle: () => document
    });

    expect(result).toMatchObject({ status: "synced", revisionSha256: "updated-revision" });
    expect(repository.activateAuthorStyle).toHaveBeenCalledWith({
      document,
      notionPageId: pageId,
      expectedState: state
    });
  });

  it("does not write if Notion content changes during synchronization", async () => {
    vi.mocked(notion.getMarkdown)
      .mockResolvedValueOnce(markdown("# First"))
      .mockResolvedValueOnce(markdown("# Second"));

    const result = await processSyncMessage(message("page.properties_updated"), {
      notion,
      repository
    });

    expect(result).toMatchObject({ status: "failed", reason: "notion_content_changed_during_sync" });
    expect(repository.syncNotionPage).not.toHaveBeenCalled();
    expect(notion.updateWorkflow).toHaveBeenLastCalledWith(pageId, expect.objectContaining({
      status: "Conflict"
    }));
  });

  it("keeps the active revision when Notion Markdown is incomplete", async () => {
    vi.mocked(notion.getMarkdown).mockResolvedValue({
      markdown: "# Partial",
      truncated: true,
      unknownBlockIds: ["block-1"]
    });

    const result = await processSyncMessage(message("page.properties_updated"), {
      notion,
      repository
    });

    expect(result).toMatchObject({ status: "failed", reason: "notion_markdown_incomplete" });
    expect(repository.syncNotionPage).not.toHaveBeenCalled();
    expect(notion.updateWorkflow).toHaveBeenLastCalledWith(pageId, expect.objectContaining({
      status: "Error"
    }));
  });

  it("keeps reproducible evidence when the historical chapter mapping error occurs", async () => {
    currentManaged = managedDocument({
      documentId: "ore-body-style",
      name: "Body style",
      category: "Author Style",
      schemaVersion: "author-style-v1"
    });
    vi.mocked(notion.getMarkdown).mockResolvedValue(markdown("## 21. Longform\n\n### 21.9 Contract\n\nBody\n\n## 22. References"));

    const result = await processSyncMessage(message("page.properties_updated"), {
      notion,
      repository,
      now: () => now,
      parseAuthorStyle: () => {
        throw new SyncFailure(
          "author_style_validation_failed",
          "expected H3 delivery sections under 22. References"
        );
      }
    });

    expect(result).toMatchObject({ status: "failed", reason: "author_style_validation_failed" });
    const entries = vi.mocked(repository.appendSyncStateLog).mock.calls.map(([entry]) => entry);
    expect(entries.at(-1)).toMatchObject({
      state: "failed",
      documentId: "ore-body-style",
      validationStatus: "failed",
      parserVersion: "author-style-parser-v2",
      errorCode: "author_style_validation_failed",
      errorMessage: "expected H3 delivery sections under 22. References",
      retryable: false,
      nextAction: "review_notion_and_set_ready"
    });
    expect(entries.at(-1)?.sourceMarkdownSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(entries.at(-1)?.inputFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(entries.some((entry) => entry.state === "content_validated")).toBe(false);
  });

  it("restores an H1 from the Notion page title for author-style parsing", () => {
    expect(canonicalAuthorStyleMarkdown(
      managedDocument({ name: "山田太郎 タイトル再現ガイド" }),
      "## 使い方\n\n本文"
    )).toBe("# 山田太郎 タイトル再現ガイド\n\n## 使い方\n\n本文");
    expect(canonicalAuthorStyleMarkdown(
      managedDocument({ name: "Ignored" }),
      "# Existing title\n\nBody"
    )).toBe("# Existing title\n\nBody");
  });

});

function managedDocument(
  overrides: Partial<ManagedNotionDocument> = {}
): ManagedNotionDocument {
  return {
    pageId,
    dataSourceId: "data-source",
    documentId: "profile",
    name: "Profile",
    category: "Personal Context",
    status: "Ready",
    active: true,
    schemaVersion: "personal-context-v1",
    syncSource: "Notion",
    originalPageId: null,
    syncedHash: null,
    activeRevision: null,
    lastEditedTime: "2026-07-22T11:59:00.000Z",
    ...overrides
  } as ManagedNotionDocument;
}

function markdown(value: string) {
  return { markdown: value, truncated: false, unknownBlockIds: [] };
}

function message(eventType: SyncMessage["eventType"] = "page.properties_updated"): SyncMessage {
  return { eventId: "event-1", eventType, pageId, timestamp: now.toISOString() };
}

function authorStyleDocument(
  sourceMarkdown: string,
  revisionSha256: string
): LoadedAuthorStyleDocument {
  return {
    documentId: "ore-body-style",
    authorKey: "ore",
    styleScope: "body",
    displayName: "Body style",
    sourcePathKey: `notion:${pageId}`,
    sourceMarkdown,
    sourceMarkdownSha256: sha256(sourceMarkdown),
    sourceBytes: new TextEncoder().encode(sourceMarkdown).byteLength,
    sourceLineCount: 1,
    sourceMtimeMs: 1,
    revisionSha256,
    parserVersion: "parser-v1",
    sectioningVersion: "sectioning-v1",
    routingVersion: "routing-v1",
    routingManifest: {},
    outline: {},
    sectionCount: 0,
    deliverySectionCount: 0,
    searchSpanCount: 0,
    sections: []
  };
}

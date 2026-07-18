import { describe, expect, it } from "vitest";
import { resolveDocumentId, resolveGetDocumentTarget } from "../src/tools/getDocument.js";

describe("resolveDocumentId", () => {
  it("keeps legacy pageId input as a namespaced Notion ID", () => {
    expect(resolveDocumentId("page-1", undefined)).toBe("notion:page-1");
  });

  it("accepts the unified documentId input", () => {
    expect(resolveDocumentId(undefined, "editor-knowledge:lesson-04")).toBe(
      "editor-knowledge:lesson-04"
    );
  });

  it("rejects both inputs or neither input", () => {
    expect(resolveDocumentId("page-1", "notion:page-1")).toBeNull();
    expect(resolveDocumentId(undefined, undefined)).toBeNull();
  });

  it("resolves a business knowledge section without treating it as a full document", () => {
    expect(resolveGetDocumentTarget(
      undefined,
      undefined,
      "business-knowledge:startup-science#detail-18"
    )).toEqual({
      kind: "section",
      reference: "business-knowledge:startup-science#detail-18",
      documentId: "startup-science",
      sectionId: "detail-18"
    });
  });

  it("requires exactly one of the three backward-compatible target inputs", () => {
    expect(resolveGetDocumentTarget("page-1", undefined, undefined)).toEqual({
      kind: "document",
      documentId: "notion:page-1"
    });
    expect(resolveGetDocumentTarget(undefined, "business-knowledge:startup-science", undefined))
      .toEqual({ kind: "document", documentId: "business-knowledge:startup-science" });
    expect(resolveGetDocumentTarget(
      undefined,
      "notion:page-1",
      "business-knowledge:startup-science#detail-18"
    )).toBeNull();
    expect(resolveGetDocumentTarget(undefined, undefined, "business-knowledge:bad#not/a-section"))
      .toBeNull();
  });
});

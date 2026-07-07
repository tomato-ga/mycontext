import { describe, expect, it } from "vitest";
import { discoverPages } from "../src/discovery.js";

describe("discoverPages", () => {
  it("recursively adds child pages without duplicating seeds", async () => {
    const client = {
      async listPageReferences(pageId: string) {
        if (pageId === "root") {
          return [
            { pageId: "child", title: "Child", parentPageId: "root", kind: "child_page" as const },
            { pageId: "root", title: "Root", parentPageId: "root", kind: "link_to_page" as const }
          ];
        }
        if (pageId === "child") {
          return [
            { pageId: "grandchild", title: "Grandchild", parentPageId: "child", kind: "child_page" as const }
          ];
        }
        return [];
      }
    };

    const result = await discoverPages([{ pageId: "root", title: "Root" }], client);

    expect(result.discoveredCount).toBe(2);
    expect(result.pages).toEqual([
      { pageId: "root", title: "Root" },
      { pageId: "child", title: "Child" },
      { pageId: "grandchild", title: "Grandchild" }
    ]);
  });
});

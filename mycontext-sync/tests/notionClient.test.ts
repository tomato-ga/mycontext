import { describe, expect, it } from "vitest";
import { isRetryableNotionStatus, parseBlockChildrenResponse, parsePageTitleResponse } from "../src/notionClient.js";

describe("notionClient", () => {
  it("treats 502 as retryable", () => {
    expect(isRetryableNotionStatus(502)).toBe(true);
  });

  it("does not retry auth or access errors", () => {
    expect(isRetryableNotionStatus(401)).toBe(false);
    expect(isRetryableNotionStatus(403)).toBe(false);
    expect(isRetryableNotionStatus(404)).toBe(false);
  });

  it("extracts child page and page-link blocks", () => {
    const parsed = parseBlockChildrenResponse({
      results: [
        { id: "child-1", type: "child_page", child_page: { title: "Child Page" } },
        { id: "link-1", type: "link_to_page", link_to_page: { type: "page_id", page_id: "page-2" } },
        { id: "db-1", type: "link_to_page", link_to_page: { type: "database_id", database_id: "db-1" } },
        { id: "p-1", type: "paragraph", paragraph: {} }
      ],
      next_cursor: null
    });

    expect(parsed.results).toEqual([
      { id: "child-1", type: "child_page", child_page: { title: "Child Page" } },
      { id: "link-1", type: "link_to_page", link_to_page: { type: "page_id", page_id: "page-2" } },
      { id: "db-1", type: "link_to_page", link_to_page: { type: "database_id", database_id: "db-1" } }
    ]);
  });

  it("extracts page titles from page properties", () => {
    expect(
      parsePageTitleResponse({
        properties: {
          title: {
            type: "title",
            title: [
              { plain_text: "Hello" },
              { plain_text: " World" }
            ]
          }
        }
      })
    ).toBe("Hello World");
  });
});

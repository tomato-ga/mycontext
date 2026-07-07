import { describe, expect, it } from "vitest";
import {
  buildLikePattern,
  buildSearchSql,
  escapeLikePattern,
  TopKValidationError,
  validateTopK
} from "../src/tidb.js";

describe("validateTopK", () => {
  it("allows integers from 1 to 20", () => {
    expect(validateTopK(1)).toBe(1);
    expect(validateTopK(5)).toBe(5);
    expect(validateTopK(20)).toBe(20);
  });

  it("rejects values outside the allowed range", () => {
    expect(() => validateTopK(0)).toThrow(TopKValidationError);
    expect(() => validateTopK(21)).toThrow(TopKValidationError);
  });

  it("rejects non-integers", () => {
    expect(() => validateTopK(1.5)).toThrow(TopKValidationError);
  });
});

describe("LIKE pattern escaping", () => {
  it("escapes SQL LIKE wildcards and the escape character", () => {
    expect(escapeLikePattern("100%_\\done")).toBe("100\\%\\_\\\\done");
    expect(buildLikePattern("100%_\\done")).toBe("%100\\%\\_\\\\done%");
  });
});

describe("buildSearchSql", () => {
  it("builds full-markdown LIKE search SQL and inlines only the prevalidated LIMIT integer", () => {
    const sql = buildSearchSql(5);

    expect(sql).toContain("LIMIT 5");
    expect(sql).not.toContain("LIMIT ?");
    expect(sql).toContain("FROM notion_pages");
    expect(sql).toContain("markdown LIKE ? ESCAPE '\\\\'");
    expect(sql).toContain("LOCATE(?, markdown) AS match_position");
    expect(sql).not.toContain("VEC_COSINE_DISTANCE");
  });
});

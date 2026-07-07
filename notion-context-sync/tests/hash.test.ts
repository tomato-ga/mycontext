import { describe, expect, it } from "vitest";
import { computeSyncIdentifiers, sha256 } from "../src/hash.js";

describe("hash helpers", () => {
  it("computes sha256 hex digests", () => {
    expect(sha256("hello")).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
  });

  it("computes stable Notion sync identifiers", () => {
    const ids = computeSyncIdentifiers("page-1", "# Title");
    expect(ids.markdownSha256).toBe(sha256("# Title"));
  });
});

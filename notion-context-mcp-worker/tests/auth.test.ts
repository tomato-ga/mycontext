import { describe, expect, it } from "vitest";
import { constantTimeEqual, isAuthorized } from "../src/auth.js";

describe("isAuthorized", () => {
  it("accepts the correct bearer token", () => {
    expect(isAuthorized("Bearer expected-token", "expected-token")).toBe(true);
  });

  it("rejects the wrong bearer token", () => {
    expect(isAuthorized("Bearer wrong-token", "expected-token")).toBe(false);
  });

  it("rejects a missing authorization header", () => {
    expect(isAuthorized(null, "expected-token")).toBe(false);
  });

  it("rejects an empty expected token", () => {
    expect(isAuthorized("Bearer anything", "")).toBe(false);
  });

  it("rejects unequal-length tokens", () => {
    expect(constantTimeEqual("short", "shorter")).toBe(false);
  });
});

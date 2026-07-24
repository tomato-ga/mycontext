import { describe, expect, it } from "vitest";
import { loadConfig, type Env } from "../src/config.js";

describe("sync worker configuration", () => {
  it("requires the TiDB writer, Notion, and webhook settings", () => {
    expect(() => loadConfig({ SYNC_QUEUE: {} } as Env))
      .toThrow("Missing or invalid environment variable(s)");
  });
});

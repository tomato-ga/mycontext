import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("sync state log schema", () => {
  it("is append-only and keeps enough evidence to reproduce a failed run", async () => {
    const sql = await fs.readFile(new URL("../sync-state-log-schema.sql", import.meta.url), "utf8");

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS context_sync_state_log");
    expect(sql).toContain("UNIQUE KEY uk_context_sync_run_sequence (run_id, sequence_no)");
    expect(sql).toContain("input_fingerprint CHAR(64)");
    expect(sql).toContain("source_markdown_sha256 CHAR(64)");
    expect(sql).toContain("parser_version VARCHAR(64)");
    expect(sql).toContain("error_code VARCHAR(128)");
    expect(sql).toContain("next_action VARCHAR(128) NOT NULL");
    expect(sql).not.toMatch(/\b(?:UPDATE|DELETE|ALTER)\b/i);
  });
});

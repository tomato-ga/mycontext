import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig, type EnvSource } from "../src/config.js";

const completeEnv: EnvSource = {
  TIDB_DATABASE_URL: "mysql://mcp-reader.example.invalid/notion_context",
  MCP_ACCESS_TOKEN: "test-access-token"
};

describe("loadConfig", () => {
  it("loads required configuration", () => {
    expect(loadConfig(completeEnv)).toMatchObject({
      tidbDatabaseUrl: "mysql://mcp-reader.example.invalid/notion_context",
      mcpAccessToken: "test-access-token"
    });
  });

  it("throws a clear error when a required environment variable is missing", () => {
    const env = { ...completeEnv };
    delete env.TIDB_DATABASE_URL;

    expect(() => loadConfig(env)).toThrow(ConfigError);
    expect(() => loadConfig(env)).toThrow("Missing or empty required environment variable(s): TIDB_DATABASE_URL");
  });

  it("throws a clear error when a required environment variable is empty", () => {
    expect(() => loadConfig({ ...completeEnv, MCP_ACCESS_TOKEN: " " })).toThrow(
      "Missing or empty required environment variable(s): MCP_ACCESS_TOKEN"
    );
  });
});

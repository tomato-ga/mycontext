import { z } from "zod";

export interface Env {
  TIDB_DATABASE_URL: string;
  MCP_ACCESS_TOKEN: string;
}

export interface AppConfig {
  tidbDatabaseUrl: string;
  mcpAccessToken: string;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export type EnvStringKey =
  | "TIDB_DATABASE_URL"
  | "MCP_ACCESS_TOKEN";

export type EnvSource = Partial<Record<EnvStringKey, string>>;

const nonEmptyString = z.string().trim().min(1);

const envSchema = z.object({
  TIDB_DATABASE_URL: nonEmptyString,
  MCP_ACCESS_TOKEN: nonEmptyString
});

export function loadConfig(env: EnvSource): AppConfig {
  const values = validateRequiredEnv(env);

  return {
    tidbDatabaseUrl: values.TIDB_DATABASE_URL,
    mcpAccessToken: values.MCP_ACCESS_TOKEN
  };
}

export function validateRequiredEnv(env: EnvSource): z.infer<typeof envSchema> {
  const parsed = envSchema.safeParse(env);
  if (parsed.success) {
    return parsed.data;
  }

  const missingKeys = Array.from(
    new Set(
      parsed.error.issues
        .map((issue) => issue.path[0])
        .filter((key): key is EnvStringKey => typeof key === "string")
    )
  ).sort();

  throw new ConfigError(`Missing or empty required environment variable(s): ${missingKeys.join(", ")}`);
}

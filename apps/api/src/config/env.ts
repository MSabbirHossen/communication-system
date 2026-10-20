import {
  appEnvironment,
  envList,
  envPort,
  httpUrl,
  logLevel,
  parseEnv,
  z,
  type EnvSource,
} from "@cs/validation";

const schema = z.object({
  NODE_ENV: appEnvironment.default("development"),
  PORT: envPort.default(3000),
  MONGODB_URI: z.string().min(1),
  MONGODB_DB_NAME: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,63}$/, "expected a MongoDB database name (letters, digits, _ or -)")
    .default("communication_system"),
  LOG_LEVEL: logLevel.optional(),
  CORS_ORIGINS: envList.default(["http://localhost:5173"]),
  /** Reserved for Phase 6 (token validation against the homeserver). Optional until then. */
  MATRIX_HOMESERVER_URL: httpUrl.optional(),
});

export type ApiEnv = {
  NODE_ENV: "development" | "test" | "production";
  PORT: number;
  MONGODB_URI: string;
  MONGODB_DB_NAME: string;
  LOG_LEVEL: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
  CORS_ORIGINS: string[];
  MATRIX_HOMESERVER_URL?: string | undefined;
};

export class ConfigBoundaryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigBoundaryError";
  }
}

/**
 * Validate configuration and apply environment boundaries (TRD §15.1):
 * - test: database name gets a `_test` suffix and logging is silent unless set;
 * - production: permissive CORS (`*`) and verbose log levels are refused.
 * Throws `EnvValidationError` (names only) or `ConfigBoundaryError`.
 */
export function loadEnv(source: EnvSource = process.env): ApiEnv {
  const parsed = parseEnv(schema, source);
  const env: ApiEnv = {
    ...parsed,
    LOG_LEVEL: parsed.LOG_LEVEL ?? (parsed.NODE_ENV === "test" ? "silent" : "info"),
    MONGODB_DB_NAME:
      parsed.NODE_ENV === "test" && !parsed.MONGODB_DB_NAME.endsWith("_test")
        ? `${parsed.MONGODB_DB_NAME}_test`
        : parsed.MONGODB_DB_NAME,
  };
  if (env.NODE_ENV === "production") {
    if (env.CORS_ORIGINS.includes("*")) {
      throw new ConfigBoundaryError("CORS_ORIGINS must list explicit origins in production");
    }
    if (env.LOG_LEVEL === "debug" || env.LOG_LEVEL === "trace") {
      throw new ConfigBoundaryError("LOG_LEVEL must not be debug or trace in production");
    }
  }
  return env;
}

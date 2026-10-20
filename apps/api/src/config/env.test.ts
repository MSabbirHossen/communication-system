import { describe, expect, it } from "vitest";
import { EnvValidationError } from "@cs/validation";
import { ConfigBoundaryError, loadEnv } from "./env.js";

const base = { MONGODB_URI: "mongodb://localhost:27017" };

describe("loadEnv", () => {
  it("applies defaults in development", () => {
    const env = loadEnv({ ...base });
    expect(env.NODE_ENV).toBe("development");
    expect(env.PORT).toBe(3000);
    expect(env.LOG_LEVEL).toBe("info");
    expect(env.CORS_ORIGINS).toEqual(["http://localhost:5173"]);
    expect(env.MONGODB_DB_NAME).toBe("communication_system");
  });
  it("lists missing variable names only", () => {
    expect(() => loadEnv({})).toThrowError(EnvValidationError);
    expect(() => loadEnv({})).toThrowError(/MONGODB_URI \(missing\)/);
  });
  it("test environment uses a _test database and silent logging", () => {
    const env = loadEnv({ ...base, NODE_ENV: "test", MONGODB_DB_NAME: "cs" });
    expect(env.MONGODB_DB_NAME).toBe("cs_test");
    expect(env.LOG_LEVEL).toBe("silent");
    expect(loadEnv({ ...base, NODE_ENV: "test", MONGODB_DB_NAME: "cs_test" }).MONGODB_DB_NAME).toBe(
      "cs_test",
    );
  });
  it("production refuses wildcard CORS and verbose logging", () => {
    expect(() => loadEnv({ ...base, NODE_ENV: "production", CORS_ORIGINS: "*" })).toThrowError(
      ConfigBoundaryError,
    );
    expect(() =>
      loadEnv({
        ...base,
        NODE_ENV: "production",
        CORS_ORIGINS: "https://app.example",
        LOG_LEVEL: "debug",
      }),
    ).toThrowError(ConfigBoundaryError);
    expect(
      loadEnv({ ...base, NODE_ENV: "production", CORS_ORIGINS: "https://app.example" })
        .CORS_ORIGINS,
    ).toEqual(["https://app.example"]);
  });
  it("validates the optional homeserver URL without echoing it", () => {
    let message = "";
    try {
      loadEnv({ ...base, MATRIX_HOMESERVER_URL: "nota-url-value" });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("MATRIX_HOMESERVER_URL");
    expect(message).not.toContain("nota-url-value");
  });
});

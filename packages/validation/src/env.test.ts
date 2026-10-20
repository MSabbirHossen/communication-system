import { describe, expect, it } from "vitest";
import { z } from "zod";
import { EnvValidationError, envBoolean, envList, envPort, httpUrl, parseEnv } from "./env.js";

const schema = z.object({
  PORT: envPort,
  MONGODB_URI: z.string().min(1),
  DEBUG: envBoolean.default(false),
  CORS_ORIGINS: envList.default([]),
  API_URL: httpUrl.optional(),
});

describe("parseEnv", () => {
  it("returns typed config for valid input", () => {
    const cfg = parseEnv(schema, {
      PORT: "3000",
      MONGODB_URI: "mongodb://localhost:27017",
      DEBUG: "yes",
      CORS_ORIGINS: "a.test, b.test",
    });
    expect(cfg.PORT).toBe(3000);
    expect(cfg.DEBUG).toBe(true);
    expect(cfg.CORS_ORIGINS).toEqual(["a.test", "b.test"]);
  });

  it("lists the names of missing variables and never their values", () => {
    const secret = "super-secret-value-9f8e7d";
    let err: unknown;
    try {
      parseEnv(schema, { MONGODB_URI: secret, PORT: "not-a-number" });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(EnvValidationError);
    const e = err as EnvValidationError;
    expect(e.issues.map((i) => i.name).sort()).toEqual(["PORT"]);
    expect(e.message).toContain("PORT");
    expect(e.message).not.toContain(secret);
    expect(e.message).not.toContain("not-a-number");
  });

  it("reports a missing required variable as missing", () => {
    expect(() => parseEnv(schema, { PORT: "3000" })).toThrowError(/MONGODB_URI \(missing\)/);
  });

  it("treats empty strings as unset", () => {
    expect(() => parseEnv(schema, { PORT: "3000", MONGODB_URI: "" })).toThrowError(
      /MONGODB_URI \(missing\)/,
    );
  });

  it("rejects bad booleans, ports and URLs without echoing values", () => {
    let message = "";
    try {
      parseEnv(schema, {
        PORT: "70000",
        MONGODB_URI: "x",
        DEBUG: "maybe",
        API_URL: "ftp://nope.test",
      });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/PORT/);
    expect(message).toMatch(/DEBUG/);
    expect(message).toMatch(/API_URL/);
    expect(message).not.toContain("70000");
    expect(message).not.toContain("maybe");
    expect(message).not.toContain("ftp://nope.test");
  });
});

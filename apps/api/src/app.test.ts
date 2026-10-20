import { describe, expect, it } from "vitest";
import request from "supertest";
import { Writable } from "node:stream";
import { createLogger } from "@cs/logger";
import { createApp } from "./app.js";
import { ApiError } from "./errors.js";
import type { ApiEnv } from "./config/env.js";

const env: ApiEnv = {
  NODE_ENV: "test",
  PORT: 0,
  MONGODB_URI: "mongodb://unused",
  MONGODB_DB_NAME: "unused_test",
  LOG_LEVEL: "info",
  CORS_ORIGINS: ["http://localhost:5173"],
};

function capturingLogger(environment: ApiEnv["NODE_ENV"] = "test") {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      lines.push(chunk.toString());
      cb();
    },
  });
  return {
    logger: createLogger({ name: "api", environment, level: "info", destination: stream }),
    text: () => lines.join(""),
  };
}

function build(opts: { mongoOk?: boolean; environment?: ApiEnv["NODE_ENV"] } = {}) {
  const { logger, text } = capturingLogger(opts.environment ?? "test");
  const app = createApp({
    env: { ...env, NODE_ENV: opts.environment ?? "test" },
    logger,
    version: "0.0.0-test",
    checks: {
      mongo: () => (opts.mongoOk === false ? Promise.reject(new Error("down")) : Promise.resolve()),
    },
    mount: (a) => {
      // Routes that throw, to exercise the error handler.
      a.get("/boom", () => {
        throw new Error("secret internal detail");
      });
      a.get("/teapot", () => {
        throw new ApiError(418, "teapot", "short and stout", { field: "spout" });
      });
    },
  });
  return { app, text };
}

describe("health and readiness", () => {
  it("GET /api/v1/health returns the envelope", async () => {
    const { app } = build();
    const res = await request(app).get("/api/v1/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: "ok",
      service: "api",
      version: "0.0.0-test",
      environment: "test",
    });
    expect(res.headers["x-request-id"]).toMatch(/[0-9a-f-]{36}/);
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
  it("GET /api/v1/ready is 200 when Mongo pings and 503 when it does not", async () => {
    const ok = await request(build({ mongoOk: true }).app).get("/api/v1/ready");
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ status: "ready", checks: { mongo: "ok" } });
    const bad = await request(build({ mongoOk: false }).app).get("/api/v1/ready");
    expect(bad.status).toBe(503);
    expect(bad.body).toEqual({ status: "unavailable", checks: { mongo: "failed" } });
  });
});

describe("error envelope", () => {
  it("unknown routes return the 404 envelope with a request id", async () => {
    const res = await request(build().app).get("/api/v1/nope");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
    expect(res.body.error.requestId).toBe(res.headers["x-request-id"]);
  });
  it("honours a well-formed incoming x-request-id and ignores a malformed one", async () => {
    const good = await request(build().app)
      .get("/api/v1/health")
      .set("x-request-id", "trace-abc-123");
    expect(good.headers["x-request-id"]).toBe("trace-abc-123");
    const bad = await request(build().app).get("/api/v1/health").set("x-request-id", "<script>");
    expect(bad.headers["x-request-id"]).not.toBe("<script>");
  });
  it("ApiError maps to its status, code, message and details", async () => {
    const res = await request(build().app).get("/teapot");
    expect(res.status).toBe(418);
    expect(res.body.error).toMatchObject({
      code: "teapot",
      message: "short and stout",
      details: { field: "spout" },
    });
  });
  it("unexpected errors become a generic 500 with no internal detail in the body", async () => {
    const { app, text } = build({ environment: "production" });
    const res = await request(app).get("/boom");
    expect(res.status).toBe(500);
    expect(res.body.error).toEqual({
      code: "internal",
      message: "internal server error",
      requestId: res.headers["x-request-id"],
    });
    expect(JSON.stringify(res.body)).not.toContain("secret internal detail");
    // The logger sees the message (for operators) but no stack in production.
    expect(text()).toContain("secret internal detail");
    expect(text()).not.toContain('"stack"');
  });
  it("rejects oversized JSON bodies with 413 and malformed JSON with 400", async () => {
    const big = await request(build().app)
      .post("/api/v1/health")
      .set("content-type", "application/json")
      .send(JSON.stringify({ x: "a".repeat(70_000) }));
    expect(big.status).toBe(413);
    expect(big.body.error.code).toBe("payload_too_large");
    const malformed = await request(build().app)
      .post("/api/v1/health")
      .set("content-type", "application/json")
      .send("{not json");
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe("invalid_json");
  });
});

describe("privacy-safe request logging", () => {
  it("logs method, route and status but never the Authorization header or body", async () => {
    const { app, text } = build();
    await request(app)
      .post("/api/v1/health")
      .set("authorization", "Bearer syt_supersecret_token_value")
      .send({ password: "body-secret-value", note: "hello" });
    const out = text();
    expect(out).toContain('"method":"POST"');
    expect(out).toContain('"status":404');
    expect(out).not.toContain("syt_supersecret_token_value");
    expect(out).not.toContain("body-secret-value");
    expect(out).not.toContain("hello");
  });
});

describe("security headers and CORS", () => {
  it("sets helmet headers and allows only configured origins", async () => {
    const { app } = build();
    const res = await request(app).get("/api/v1/health").set("origin", "http://localhost:5173");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    const other = await request(app).get("/api/v1/health").set("origin", "http://evil.test");
    expect(other.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

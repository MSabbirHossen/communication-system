import { describe, expect, it, vi } from "vitest";
import { Writable } from "node:stream";
import { createLogger, REDACTED, scrub } from "./index.js";
import { createBrowserLogger } from "./browser.js";

function capture() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      lines.push(chunk.toString());
      cb();
    },
  });
  return { stream, lines, text: () => lines.join("") };
}

const SECRETS = {
  password: "hunter2-password-value",
  access_token: "syt_YWxpY2U_abcdefghijklmnop_123456",
  refresh_token: "refresh-token-value-xyz",
  recovery_key: "EsTc abcd efgh ijkl",
  authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig",
  body: "Hello from Alice. PLAINTEXT-NONCE-1",
  content: { body: "nested plaintext", msgtype: "m.text" },
  ciphertext: "AwgAEqAB-ciphertext-value",
  apiKey: "api-key-value-123",
  myCustomSecretThing: "custom-secret-value",
};
const SECRET_VALUES = [
  "hunter2-password-value",
  "syt_YWxpY2U_abcdefghijklmnop_123456",
  "refresh-token-value-xyz",
  "EsTc abcd efgh ijkl",
  "eyJhbGciOiJIUzI1NiJ9",
  "PLAINTEXT-NONCE-1",
  "nested plaintext",
  "AwgAEqAB-ciphertext-value",
  "api-key-value-123",
  "custom-secret-value",
];

describe("scrub", () => {
  it("redacts sensitive keys, key fragments and token-shaped values", () => {
    const out = JSON.stringify(
      scrub({
        ...SECRETS,
        ok: "visible",
        nested: { deeper: { token: "t" } },
        bare: "syt_looks_like_a_token",
      }),
    );
    for (const v of SECRET_VALUES) expect(out).not.toContain(v);
    expect(out).toContain("visible");
    expect(out).toContain(REDACTED);
    expect(out).not.toContain("syt_looks_like_a_token");
  });
  it("bounds depth and handles cycles without throwing", () => {
    const a: Record<string, unknown> = { name: "a" };
    a.self = a;
    expect(() => scrub(a)).not.toThrow();
    expect(JSON.stringify(scrub(a))).toContain("[circular]");
    let deep: Record<string, unknown> = { v: 1 };
    for (let i = 0; i < 20; i++) deep = { child: deep };
    expect(JSON.stringify(scrub(deep))).toContain("[depth limit]");
  });
  it("serialises errors with the stack only when asked", () => {
    const err = new Error("boom");
    expect(JSON.stringify(scrub(err))).not.toContain("stack");
    expect(JSON.stringify(scrub(err, { includeStack: true }))).toContain("stack");
  });
});

describe("createLogger (node)", () => {
  it("never emits secret values, even nested, and keeps safe fields", () => {
    const c = capture();
    const log = createLogger({
      name: "test",
      environment: "development",
      level: "info",
      destination: c.stream,
    });
    log.info(
      {
        requestId: "req-1",
        ...SECRETS,
        req: { headers: { authorization: "Bearer abc.def.ghi", "x-safe": "yes" } },
      },
      "request handled",
    );
    const out = c.text();
    expect(out).toContain("request handled");
    expect(out).toContain("req-1");
    expect(out).toContain('"x-safe":"yes"');
    for (const v of SECRET_VALUES) expect(out).not.toContain(v);
    expect(out).not.toContain("abc.def.ghi");
  });
  it("includes error stacks in development and omits them in production", () => {
    const dev = capture();
    createLogger({
      name: "t",
      environment: "development",
      level: "error",
      destination: dev.stream,
    }).error({ err: new Error("dev boom") }, "failed");
    expect(dev.text()).toContain("dev boom");
    expect(dev.text()).toContain("stack");
    const prod = capture();
    createLogger({
      name: "t",
      environment: "production",
      level: "error",
      destination: prod.stream,
    }).error({ err: new Error("prod boom") }, "failed");
    expect(prod.text()).toContain("prod boom");
    expect(prod.text()).not.toContain("stack");
  });
  it("is silent by default in the test environment", () => {
    const c = capture();
    createLogger({ name: "t", environment: "test", destination: c.stream }).info("nothing");
    expect(c.text()).toBe("");
  });
});

describe("createBrowserLogger", () => {
  it("respects the level and scrubs data", () => {
    const sink = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
    const log = createBrowserLogger({ name: "web", level: "info", sink });
    log.debug("hidden");
    log.info("shown", { access_token: "syt_secret_value_123", page: "chats" });
    expect(sink.debug).not.toHaveBeenCalled();
    expect(sink.info).toHaveBeenCalledTimes(1);
    const printed = JSON.stringify(sink.info.mock.calls[0]);
    expect(printed).toContain("[web] shown");
    expect(printed).toContain("chats");
    expect(printed).not.toContain("syt_secret_value_123");
  });
  it("child loggers carry the scope", () => {
    const sink = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
    createBrowserLogger({ name: "web", sink }).child("sync").warn("slow");
    expect(sink.warn.mock.calls[0]?.[0]).toBe("[web:sync] slow");
  });
});

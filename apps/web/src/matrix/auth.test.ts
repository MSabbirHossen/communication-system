import { describe, expect, it, vi } from "vitest";
import { ConnectionError, MatrixError } from "matrix-js-sdk";
import { AuthFailure, toAuthError } from "./errors";
import { SessionStorageUnavailableError } from "./sessionStore";
import { defaultDeviceName, validatePassword, validateUsername } from "./auth";

const mx = (errcode: string, httpStatus: number, extra: Record<string, unknown> = {}) =>
  new MatrixError({ errcode, error: "server text", ...extra }, httpStatus);

describe("toAuthError", () => {
  it("maps credential and registration failures without exposing account existence", () => {
    expect(toAuthError(mx("M_FORBIDDEN", 403)).code).toBe("invalid_credentials");
    expect(toAuthError(mx("M_USER_IN_USE", 400)).code).toBe("user_in_use");
    expect(toAuthError(mx("M_INVALID_USERNAME", 400)).code).toBe("invalid_username");
    expect(toAuthError(mx("M_WEAK_PASSWORD", 400)).code).toBe("weak_password");
  });
  it("carries retry_after_ms for rate limits", () => {
    expect(toAuthError(mx("M_LIMIT_EXCEEDED", 429, { retry_after_ms: 2500 }))).toEqual({
      code: "rate_limited",
      retryAfterMs: 2500,
      detail: "M_LIMIT_EXCEEDED/429",
    });
  });
  it("maps token and transport failures", () => {
    expect(toAuthError(mx("M_UNKNOWN_TOKEN", 401)).code).toBe("session_expired");
    expect(toAuthError(mx("M_UNKNOWN", 502)).code).toBe("server");
    expect(toAuthError(new ConnectionError("down")).code).toBe("network");
    expect(toAuthError(new TypeError("Failed to fetch")).code).toBe("network");
    expect(toAuthError(new SessionStorageUnavailableError()).code).toBe("storage_unavailable");
    expect(toAuthError(new Error("?")).code).toBe("unknown");
  });
  it("never includes the server's free-text message or user input", () => {
    const e = toAuthError(mx("M_FORBIDDEN", 403, { error: "Invalid password for @alice" }));
    expect(JSON.stringify(e)).not.toContain("alice");
    expect(JSON.stringify(e)).not.toContain("Invalid password");
  });
  it("passes AuthFailure through unchanged", () => {
    const f = new AuthFailure({ code: "unsupported_flow", detail: "flows=m.login.email.identity" });
    expect(toAuthError(f)).toBe(f.error);
  });
});

describe("field validation", () => {
  it("accepts Matrix localparts and rejects the rest", () => {
    expect(validateUsername("alice.b-2")).toBeNull();
    expect(validateUsername("")).toBe("required");
    expect(validateUsername("Alice")).toBe("invalid_username");
    expect(validateUsername("al ice")).toBe("invalid_username");
    expect(validateUsername("@alice:localhost")).toBe("invalid_username");
  });
  it("enforces a minimum password length only (policy is the homeserver's)", () => {
    expect(validatePassword("")).toBe("required");
    expect(validatePassword("short")).toBe("password_too_short");
    expect(validatePassword("long enough 1")).toBeNull();
  });
});

describe("defaultDeviceName", () => {
  it("describes browser and OS coarsely without fingerprinting detail", () => {
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
    expect(defaultDeviceName(ua)).toBe("Web · Chrome on Windows");
    expect(defaultDeviceName("")).toBe("Web · Browser");
    expect(defaultDeviceName(ua)).not.toContain("130");
  });
  it("does not touch navigator in the pure path", () => {
    const spy = vi.spyOn(globalThis, "navigator", "get");
    defaultDeviceName("x");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

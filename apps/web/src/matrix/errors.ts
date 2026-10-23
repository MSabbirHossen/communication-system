// Maps SDK/network failures to user-safe error codes. Messages never reveal whether an
// account exists, never include server internals, and never include what the user typed.
import { ConnectionError, MatrixError } from "matrix-js-sdk";
import { SessionStorageUnavailableError } from "./sessionStore";

export type AuthErrorCode =
  | "invalid_credentials"
  | "user_in_use"
  | "invalid_username"
  | "weak_password"
  | "rate_limited"
  | "unsupported_flow"
  | "session_expired"
  | "storage_unavailable"
  | "network"
  | "server"
  | "unknown";

export interface AuthError {
  code: AuthErrorCode;
  /** Present for rate limits, from the server's retry_after_ms. */
  retryAfterMs?: number | undefined;
  /** Machine-readable detail safe to log (errcode / status), never user input. */
  detail?: string | undefined;
}

export class AuthFailure extends Error {
  readonly error: AuthError;
  constructor(error: AuthError) {
    super(error.code);
    this.name = "AuthFailure";
    this.error = error;
  }
}

export function toAuthError(err: unknown): AuthError {
  if (err instanceof AuthFailure) return err.error;
  if (err instanceof SessionStorageUnavailableError) return { code: "storage_unavailable" };
  if (err instanceof ConnectionError) return { code: "network", detail: err.name };
  if (err instanceof MatrixError) {
    const data = err.data as { retry_after_ms?: unknown } | undefined;
    const detail = `${err.errcode ?? "no_errcode"}/${err.httpStatus ?? "?"}`;
    switch (err.errcode) {
      case "M_FORBIDDEN":
        return { code: "invalid_credentials", detail };
      case "M_USER_IN_USE":
        return { code: "user_in_use", detail };
      case "M_INVALID_USERNAME":
        return { code: "invalid_username", detail };
      case "M_WEAK_PASSWORD":
      case "M_PASSWORD_TOO_SHORT":
      case "M_PASSWORD_NO_DIGIT":
      case "M_PASSWORD_NO_LOWERCASE":
      case "M_PASSWORD_NO_UPPERCASE":
      case "M_PASSWORD_NO_SYMBOL":
      case "M_PASSWORD_IN_DICTIONARY":
        return { code: "weak_password", detail };
      case "M_LIMIT_EXCEEDED": {
        const retryAfterMs =
          typeof data?.retry_after_ms === "number" ? data.retry_after_ms : undefined;
        return retryAfterMs === undefined
          ? { code: "rate_limited", detail }
          : { code: "rate_limited", retryAfterMs, detail };
      }
      case "M_UNKNOWN_TOKEN":
      case "M_MISSING_TOKEN":
        return { code: "session_expired", detail };
      default:
        if ((err.httpStatus ?? 0) >= 500) return { code: "server", detail };
        return { code: "unknown", detail };
    }
  }
  if (err instanceof TypeError && /fetch|network/i.test(err.message)) return { code: "network" };
  return { code: "unknown" };
}

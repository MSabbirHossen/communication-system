// Types shared between the web client and the application API.
// Keep this package free of runtime code and of anything Matrix-owned
// (rooms, events, device keys live in the Matrix SDK, see ADR-0001 C4).

export type AppEnvironment = "development" | "test" | "production";

/** Consistent error envelope for every application API response (TRD §8.2). */
export interface ApiErrorEnvelope {
  error: {
    /** Stable machine-readable code, e.g. "not_found", "validation_failed", "internal". */
    code: string;
    /** Safe, user-displayable message. Never contains stack traces or secrets. */
    message: string;
    /** Correlates with server logs. */
    requestId: string;
    /** Optional structured details (e.g. field errors). Never raw payloads. */
    details?: unknown;
  };
}

export interface HealthResponse {
  status: "ok";
  service: string;
  version: string;
  environment: AppEnvironment;
}

export type CheckStatus = "ok" | "failed";

export interface ReadyResponse {
  status: "ready" | "unavailable";
  checks: Record<string, CheckStatus>;
}

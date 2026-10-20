import type { ApiErrorEnvelope } from "@cs/shared-types";

/** An error the API chooses to expose. `message` must be safe for users. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const notFound = (what = "resource"): ApiError =>
  new ApiError(404, "not_found", `${what} not found`);

export function envelope(
  code: string,
  message: string,
  requestId: string,
  details?: unknown,
): ApiErrorEnvelope {
  const body: ApiErrorEnvelope = { error: { code, message, requestId } };
  if (details !== undefined) body.error.details = details;
  return body;
}

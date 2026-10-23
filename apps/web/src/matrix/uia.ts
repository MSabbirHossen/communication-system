// User-Interactive Authentication (UIA) with the password stage, for operations the
// homeserver protects with re-authentication: uploading cross-signing keys, deleting a
// device. The password is requested from the user each time and never cached.
import { MatrixError } from "matrix-js-sdk";
import type { AuthDict, UIAuthCallback } from "matrix-js-sdk/lib/interactive-auth.js";
import { AuthFailure, toAuthError } from "./errors";

export class UiaCancelled extends Error {
  constructor() {
    super("re-authentication cancelled");
    this.name = "UiaCancelled";
  }
}

/** Resolve with the password, or reject with UiaCancelled when the user backs out. */
export type RequestPassword = () => Promise<string>;

function uiaSession(err: unknown): string | null {
  if (!(err instanceof MatrixError) || err.httpStatus !== 401) return null;
  const data = err.data as { session?: unknown; flows?: Array<{ stages: string[] }> };
  if (typeof data.session !== "string") return null;
  const supportsPassword = data.flows?.some((f) => f.stages.includes("m.login.password"));
  return supportsPassword === false ? null : data.session;
}

/**
 * Wrap an SDK operation that may demand UIA. First try without auth; on a 401 with a
 * password flow, ask for the password once and retry with it.
 */
export function passwordUia<T>(
  userId: string,
  requestPassword: RequestPassword,
): UIAuthCallback<T> {
  return async (makeRequest) => {
    try {
      return await makeRequest(null);
    } catch (err) {
      const session = uiaSession(err);
      if (!session) throw err;
      const password = await requestPassword();
      const auth: AuthDict = {
        type: "m.login.password",
        identifier: { type: "m.id.user", user: userId },
        password,
        session,
      };
      try {
        return await makeRequest(auth);
      } catch (err2) {
        throw new AuthFailure(toAuthError(err2));
      }
    }
  };
}

/** Run `op(auth)` under password UIA (for SDK methods that take an AuthDict, like deleteDevice). */
export async function withPasswordUia<T>(
  userId: string,
  requestPassword: RequestPassword,
  op: (auth: AuthDict | undefined) => Promise<T>,
): Promise<T> {
  return passwordUia<T>(userId, requestPassword)((auth) => op(auth ?? undefined));
}

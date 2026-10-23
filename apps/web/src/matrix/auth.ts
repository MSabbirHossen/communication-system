// Matrix-native password registration and login (ADR-0001). Returns a StoredSession;
// the caller persists it. Credentials are passed straight to the SDK and never logged.
import { createClient, MatrixError, type MatrixClient } from "matrix-js-sdk";
import type { LoginResponse } from "matrix-js-sdk/lib/@types/auth.js";
import type { RegisterResponse } from "matrix-js-sdk/lib/@types/registration.js";
import { AuthFailure, toAuthError } from "./errors";
import type { StoredSession } from "./sessionStore";

export interface Credentials {
  username: string;
  password: string;
}

/** Matrix localpart grammar (spec: historical + strict subset we accept for new accounts). */
export const USERNAME_PATTERN = /^[a-z0-9._=/+-]{1,255}$/;
export const PASSWORD_MIN_LENGTH = 8;

export type FieldError = "required" | "invalid_username" | "password_too_short";

export function validateUsername(username: string): FieldError | null {
  if (!username) return "required";
  return USERNAME_PATTERN.test(username) ? null : "invalid_username";
}

export function validatePassword(password: string): FieldError | null {
  if (!password) return "required";
  return password.length >= PASSWORD_MIN_LENGTH ? null : "password_too_short";
}

/** A human-readable device name for the device list, without fingerprinting detail. */
export function defaultDeviceName(
  userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "",
): string {
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Firefox\//.test(userAgent)
      ? "Firefox"
      : /Chrome\//.test(userAgent)
        ? "Chrome"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : "Browser";
  const os = /Windows/.test(userAgent)
    ? "Windows"
    : /Mac OS X/.test(userAgent)
      ? "macOS"
      : /Android/.test(userAgent)
        ? "Android"
        : /iPhone|iPad/.test(userAgent)
          ? "iOS"
          : /Linux/.test(userAgent)
            ? "Linux"
            : "";
  return os ? `Web · ${browser} on ${os}` : `Web · ${browser}`;
}

function toSession(
  resp: LoginResponse | RegisterResponse,
  homeserverUrl: string,
  now = Date.now(),
): StoredSession {
  if (!resp.user_id || !resp.access_token || !resp.device_id) {
    throw new AuthFailure({
      code: "server",
      detail: "login response missing user_id/access_token/device_id",
    });
  }
  const session: StoredSession = {
    version: 1,
    homeserverUrl,
    userId: resp.user_id,
    deviceId: resp.device_id,
    accessToken: resp.access_token,
    createdAt: now,
  };
  if (resp.refresh_token) session.refreshToken = resp.refresh_token;
  if (typeof resp.expires_in_ms === "number")
    session.accessTokenExpiresAt = now + resp.expires_in_ms;
  return session;
}

function anonymousClient(homeserverUrl: string): MatrixClient {
  return createClient({ baseUrl: homeserverUrl });
}

/**
 * Register with username/password. Completes the User-Interactive Auth flow only when the
 * homeserver offers a flow consisting solely of `m.login.dummy`; any other required stage
 * (email, token, captcha) is reported as `unsupported_flow` rather than bypassed.
 */
export async function register(
  homeserverUrl: string,
  creds: Credentials,
  deviceName = defaultDeviceName(),
): Promise<StoredSession> {
  const client = anonymousClient(homeserverUrl);
  const body = {
    username: creds.username,
    password: creds.password,
    initial_device_display_name: deviceName,
    refresh_token: true,
  };
  try {
    return toSession(await client.registerRequest(body), homeserverUrl);
  } catch (err) {
    if (!(err instanceof MatrixError) || err.httpStatus !== 401)
      throw new AuthFailure(toAuthError(err));
    const uia = err.data as { session?: string; flows?: Array<{ stages: string[] }> };
    const dummyOnly = uia.flows?.some(
      (f) => f.stages.length === 1 && f.stages[0] === "m.login.dummy",
    );
    if (!uia.session || !dummyOnly) {
      throw new AuthFailure({
        code: "unsupported_flow",
        detail: `flows=${(uia.flows ?? []).map((f) => f.stages.join("+")).join(",")}`,
      });
    }
    try {
      const resp = await client.registerRequest({
        ...body,
        auth: { type: "m.login.dummy", session: uia.session },
      });
      return toSession(resp, homeserverUrl);
    } catch (err2) {
      throw new AuthFailure(toAuthError(err2));
    }
  }
}

export async function login(
  homeserverUrl: string,
  creds: Credentials,
  deviceName = defaultDeviceName(),
): Promise<StoredSession> {
  const client = anonymousClient(homeserverUrl);
  try {
    const resp = await client.loginRequest({
      type: "m.login.password",
      identifier: { type: "m.id.user", user: creds.username },
      password: creds.password,
      initial_device_display_name: deviceName,
      refresh_token: true,
    });
    return toSession(resp, homeserverUrl);
  } catch (err) {
    throw new AuthFailure(toAuthError(err));
  }
}

/** Exchange a refresh token for a new access/refresh pair (native Matrix refresh, MSC2918). */
export async function refreshSession(
  session: StoredSession,
  now = Date.now(),
): Promise<StoredSession> {
  if (!session.refreshToken)
    throw new AuthFailure({ code: "session_expired", detail: "no refresh token" });
  const client = anonymousClient(session.homeserverUrl);
  try {
    const resp = await client.refreshToken(session.refreshToken);
    return {
      ...session,
      accessToken: resp.access_token,
      refreshToken: resp.refresh_token,
      accessTokenExpiresAt: now + resp.expires_in_ms,
    };
  } catch (err) {
    throw new AuthFailure(toAuthError(err));
  }
}

/** Server-side logout of the current device; a token the server already rejects counts as done. */
export async function logoutRemote(client: MatrixClient): Promise<void> {
  try {
    await client.logout(true);
  } catch (err) {
    if (err instanceof MatrixError && err.errcode === "M_UNKNOWN_TOKEN") return;
    throw new AuthFailure(toAuthError(err));
  }
}

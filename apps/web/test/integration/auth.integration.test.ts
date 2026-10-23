import { expect, it } from "vitest";
import { login, logoutRemote, refreshSession, register } from "../../src/matrix/auth";
import { AuthFailure } from "../../src/matrix/errors";
import {
  ACCESS_TOKEN_LIFETIME_MS,
  HOMESERVER_URL,
  TEST_PASSWORD,
  describeIntegration,
  errorOf,
  loginAgain,
  newAccount,
  plainClient,
  sleep,
  uniqueUsername,
} from "./helpers";

async function failureCode(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "none";
  } catch (e) {
    if (e instanceof AuthFailure) return e.error.code;
    throw e;
  }
}

describeIntegration("authentication against the homeserver", () => {
  it("registers through the dummy UIA stage and returns a refreshable session", async () => {
    const { username, session } = await newAccount("reg");
    expect(session.userId).toMatch(new RegExp(`^@${username}:`));
    expect(session.deviceId).toMatch(/^[A-Z]{10}$/);
    expect(session.accessToken).toMatch(/^syt_/);
    expect(session.refreshToken).toMatch(/^syr_/);
    expect(session.accessTokenExpiresAt).toBeGreaterThan(Date.now());
    const whoami = await plainClient(session).whoami();
    expect(whoami).toMatchObject({ user_id: session.userId, device_id: session.deviceId });
  });

  it("login creates a second device; wrong password and unknown user fail identically", async () => {
    const acct = await newAccount("login");
    const second = await loginAgain(acct, "Test device B");
    expect(second.userId).toBe(acct.session.userId);
    expect(second.deviceId).not.toBe(acct.session.deviceId);
    expect(second.refreshToken).toMatch(/^syr_/);

    const wrongPassword = await failureCode(
      login(HOMESERVER_URL, { username: acct.username, password: `${TEST_PASSWORD}x` }),
    );
    const unknownUser = await failureCode(
      login(HOMESERVER_URL, { username: uniqueUsername("nobody"), password: TEST_PASSWORD }),
    );
    expect(wrongPassword).toBe("invalid_credentials");
    expect(unknownUser).toBe("invalid_credentials");
  });

  it("rejects a taken username and a username the server does not allow", async () => {
    const acct = await newAccount("dup");
    expect(
      await failureCode(
        register(HOMESERVER_URL, { username: acct.username, password: TEST_PASSWORD }),
      ),
    ).toBe("user_in_use");
    expect(
      await failureCode(
        register(HOMESERVER_URL, { username: "bad name!", password: TEST_PASSWORD }),
      ),
    ).toBe("invalid_username");
  });

  it("refresh rotates the token pair and the consumed refresh token cannot be replayed", async () => {
    const { session } = await newAccount("refresh");
    const refreshed = await refreshSession(session);
    expect(refreshed.accessToken).not.toBe(session.accessToken);
    expect(refreshed.refreshToken).not.toBe(session.refreshToken);
    expect(refreshed.accessTokenExpiresAt).toBeGreaterThan(Date.now());
    expect(refreshed.deviceId).toBe(session.deviceId);
    await plainClient(refreshed).whoami();

    // Synapse keeps the previous access token valid until its own expiry; only the refresh
    // token is single-use. A replay is reported as an expired session, never as bad credentials.
    expect(await failureCode(refreshSession(session))).toBe("session_expired");
  });

  it("logout invalidates the device token and is idempotent", async () => {
    const { session } = await newAccount("logout");
    const client = plainClient(session);
    await logoutRemote(client);
    const err = await errorOf(plainClient(session).whoami());
    expect(err?.errcode).toBe("M_UNKNOWN_TOKEN");
    expect((err?.data as { soft_logout?: boolean }).soft_logout).not.toBe(true);
    await expect(logoutRemote(client)).resolves.toBeUndefined();
  });

  it.skipIf(!ACCESS_TOKEN_LIFETIME_MS)(
    "an expired access token is a soft logout and a refresh restores access",
    async () => {
      const { session } = await newAccount("expiry");
      await sleep(ACCESS_TOKEN_LIFETIME_MS + 2_000);
      const err = await errorOf(plainClient(session).whoami());
      expect(err?.errcode).toBe("M_UNKNOWN_TOKEN");
      expect((err?.data as { soft_logout?: boolean }).soft_logout).toBe(true);

      const refreshed = await refreshSession(session);
      const whoami = await plainClient(refreshed).whoami();
      expect(whoami.device_id).toBe(session.deviceId);
    },
    ACCESS_TOKEN_LIFETIME_MS + 60_000,
  );
});

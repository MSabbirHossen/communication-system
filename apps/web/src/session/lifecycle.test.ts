import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthFailure } from "../matrix/errors";
import type { StoredSession } from "../matrix/sessionStore";
import { SessionController } from "./controller";
import { fakeDeps, testSession } from "../test/session";

const T0 = 1_800_000_000_000;

function withExpiry(expiresInMs: number): StoredSession {
  return { ...testSession, accessTokenExpiresAt: T0 + expiresInMs };
}

describe("token refresh and session expiry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("refreshes an expired stored token before creating the client", async () => {
    const deps = fakeDeps({
      loadSession: vi.fn(async () => withExpiry(-10_000)),
      now: () => T0,
    });
    const c = new SessionController(deps);
    await c.boot();
    expect(deps.refreshSession).toHaveBeenCalledTimes(1);
    expect(deps.createMatrixClient).toHaveBeenCalledWith(
      expect.objectContaining({
        session: expect.objectContaining({ accessToken: "syt_refreshed" }),
      }),
    );
    expect(c.getSnapshot().status).toBe("ready");
    expect(c.getSnapshot().session?.refreshToken).toBe("syr_refreshed");
  });

  it("schedules a proactive refresh one minute before expiry and applies the new token", async () => {
    const deps = fakeDeps({
      loadSession: vi.fn(async () => withExpiry(300_000)),
      now: () => Date.now(),
    });
    const c = new SessionController(deps);
    await c.boot();
    expect(deps.refreshSession).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(240_000 + 10);
    expect(deps.refreshSession).toHaveBeenCalledTimes(1);
    expect(deps.applyAccessToken).toHaveBeenCalledWith(expect.anything(), "syt_refreshed");
    expect(deps.saveSession).toHaveBeenLastCalledWith(
      expect.objectContaining({ accessToken: "syt_refreshed" }),
    );
    expect(c.getSnapshot().status).toBe("ready");
  });

  it("signs the user out when the refresh token is rejected", async () => {
    const deps = fakeDeps({
      loadSession: vi.fn(async () => withExpiry(-1)),
      refreshSession: vi.fn(async () => {
        throw new AuthFailure({ code: "session_expired" });
      }),
      now: () => T0,
    });
    const c = new SessionController(deps);
    await c.boot();
    expect(c.getSnapshot()).toMatchObject({
      status: "signed_out",
      session: null,
      error: { code: "session_expired" },
    });
    expect(deps.clearSession).toHaveBeenCalled();
    expect(deps.createMatrixClient).not.toHaveBeenCalled();
  });

  it("retries later when a proactive refresh fails on the network", async () => {
    let calls = 0;
    const deps = fakeDeps({
      loadSession: vi.fn(async () => withExpiry(120_000)),
      refreshSession: vi.fn(async (s: StoredSession) => {
        calls++;
        if (calls === 1) throw new AuthFailure({ code: "network" });
        return { ...s, accessToken: "syt_second", accessTokenExpiresAt: Date.now() + 300_000 };
      }),
      now: () => Date.now(),
    });
    const c = new SessionController(deps);
    await c.boot();
    await vi.advanceTimersByTimeAsync(60_000 + 10); // first attempt: network failure
    expect(calls).toBe(1);
    expect(c.getSnapshot().status).toBe("ready"); // still signed in
    await vi.advanceTimersByTimeAsync(30_000 + 10); // retry
    expect(calls).toBe(2);
    expect(c.getSnapshot().session?.accessToken).toBe("syt_second");
  });

  it("on a soft logout with a refresh token, refreshes and rebuilds the client on the same stores", async () => {
    let fire: ((i: { softLogout: boolean }) => void) | undefined;
    const deps = fakeDeps({
      loadSession: vi.fn(async () => withExpiry(300_000)),
      onSessionLoggedOut: vi.fn((_c, cb) => {
        fire = cb;
        return () => {};
      }),
      now: () => Date.now(),
    });
    const c = new SessionController(deps);
    await c.boot();
    const first = c.getSnapshot().client!;
    fire!({ softLogout: true });
    await vi.waitFor(() => expect(deps.createMatrixClient).toHaveBeenCalledTimes(2));
    expect(deps.refreshSession).toHaveBeenCalledTimes(1);
    // The old client is stopped (never cleared) and the new one syncs with the new token.
    expect(
      (first as unknown as { stopClient: ReturnType<typeof vi.fn> }).stopClient,
    ).toHaveBeenCalled();
    expect(deps.stopAndClearClient).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(deps.startSync).toHaveBeenCalledTimes(2));
    expect(vi.mocked(deps.createMatrixClient).mock.calls[1]![0].session.accessToken).toBe(
      "syt_refreshed",
    );
    expect(c.getSnapshot().client).not.toBe(first);
    expect(c.getSnapshot().status).toBe("ready");
  });

  it("on a hard logout (device deleted), wipes stores and shows the login screen with a reason", async () => {
    let fire: ((i: { softLogout: boolean }) => void) | undefined;
    const deps = fakeDeps({
      loadSession: vi.fn(async () => withExpiry(300_000)),
      onSessionLoggedOut: vi.fn((_c, cb) => {
        fire = cb;
        return () => {};
      }),
      now: () => Date.now(),
    });
    const c = new SessionController(deps);
    await c.boot();
    fire!({ softLogout: false });
    await vi.waitFor(() => expect(c.getSnapshot().status).toBe("signed_out"));
    expect(deps.stopAndClearClient).toHaveBeenCalled();
    expect(deps.clearSession).toHaveBeenCalled();
    expect(c.getSnapshot().error).toEqual({ code: "session_expired" });
    expect(deps.refreshSession).not.toHaveBeenCalled();
  });

  it("deduplicates concurrent refreshes", async () => {
    const deps = fakeDeps({
      loadSession: vi.fn(async () => withExpiry(300_000)),
      now: () => Date.now(),
    });
    const c = new SessionController(deps);
    await c.boot();
    await Promise.all([c.refreshNow(), c.refreshNow(), c.refreshNow()]);
    expect(deps.refreshSession).toHaveBeenCalledTimes(1);
  });

  it("drops a session whose first sync reports an unknown token and cannot be refreshed", async () => {
    const deps = fakeDeps({
      loadSession: vi.fn(async () => {
        const { refreshToken: _unused, ...noRefresh } = testSession;
        return noRefresh;
      }),
      startSync: vi.fn(async () => {
        throw new AuthFailure({ code: "session_expired" });
      }),
      now: () => Date.now(),
    });
    const c = new SessionController(deps);
    await c.boot();
    expect(c.getSnapshot()).toMatchObject({
      status: "signed_out",
      error: { code: "session_expired" },
    });
    expect(deps.stopAndClearClient).toHaveBeenCalled();
  });
});

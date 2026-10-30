import { describe, expect, it, vi } from "vitest";
import { AuthFailure } from "../matrix/errors";
import { SessionController } from "./controller";
import { fakeDeps, testSession } from "../test/session";

describe("SessionController", () => {
  it("boots to signed_out when nothing is stored", async () => {
    const c = new SessionController(fakeDeps());
    expect(c.getSnapshot().status).toBe("booting");
    await c.boot();
    expect(c.getSnapshot()).toMatchObject({ status: "signed_out", session: null, client: null });
  });

  it("restores a stored session: creates the client, starts sync, becomes ready", async () => {
    const deps = fakeDeps({ loadSession: vi.fn(async () => testSession) });
    const c = new SessionController(deps);
    await c.boot();
    expect(deps.createMatrixClient).toHaveBeenCalledWith(
      expect.objectContaining({ session: testSession }),
    );
    expect(deps.startSync).toHaveBeenCalled();
    expect(c.getSnapshot().status).toBe("ready");
    expect(c.getSnapshot().session).toEqual(testSession);
  });

  it("signIn persists the session before starting and ends ready", async () => {
    const order: string[] = [];
    const deps = fakeDeps({
      saveSession: vi.fn(async () => void order.push("save")),
      createMatrixClient: vi.fn(async () => {
        order.push("client");
        return { stopClient: vi.fn() } as never;
      }),
    });
    const c = new SessionController(deps);
    await c.boot();
    const seen: string[] = [];
    c.subscribe(() => {
      const s = c.getSnapshot().status;
      if (seen[seen.length - 1] !== s) seen.push(s);
    });
    await c.signIn({ username: "alice", password: "correct horse" });
    expect(deps.login).toHaveBeenCalledWith("http://localhost:8008", {
      username: "alice",
      password: "correct horse",
    });
    expect(order).toEqual(["save", "client"]);
    expect(seen).toEqual(["authenticating", "starting", "ready"]);
  });

  it("signUp uses register and surfaces an AuthFailure without a session", async () => {
    const deps = fakeDeps({
      register: vi.fn(async () => {
        throw new AuthFailure({ code: "user_in_use" });
      }),
    });
    const c = new SessionController(deps);
    await c.boot();
    await c.signUp({ username: "alice", password: "correct horse" });
    expect(c.getSnapshot()).toMatchObject({ status: "signed_out", error: { code: "user_in_use" } });
    expect(deps.saveSession).not.toHaveBeenCalled();
    c.clearError();
    expect(c.getSnapshot().error).toBeNull();
  });

  it("never logs credentials on failure", async () => {
    const deps = fakeDeps({
      login: vi.fn(async () => {
        throw new AuthFailure({ code: "invalid_credentials" });
      }),
    });
    const c = new SessionController(deps);
    await c.boot();
    await c.signIn({ username: "alice", password: "hunter2-secret" });
    const logged = JSON.stringify((deps.logger.warn as ReturnType<typeof vi.fn>).mock.calls);
    expect(logged).toContain("invalid_credentials");
    expect(logged).not.toContain("hunter2-secret");
    expect(logged).not.toContain("alice");
  });

  it("signOut logs out remotely, wipes stores and session, even if remote logout fails", async () => {
    const deps = fakeDeps({
      loadSession: vi.fn(async () => testSession),
      logoutRemote: vi.fn(async () => {
        throw new Error("network");
      }),
    });
    const c = new SessionController(deps);
    await c.boot();
    await c.signOut();
    expect(deps.stopAndClearClient).toHaveBeenCalled();
    expect(deps.clearSession).toHaveBeenCalled();
    expect(c.getSnapshot()).toMatchObject({ status: "signed_out", session: null, client: null });
  });

  it("persists rotated tokens handed back by the client", async () => {
    let rotate: ((t: { accessToken: string; refreshToken?: string }) => void) | undefined;
    const deps = fakeDeps({
      loadSession: vi.fn(async () => testSession),
      createMatrixClient: vi.fn(async (o) => {
        rotate = o.onTokenRefresh;
        return { stopClient: vi.fn() } as never;
      }),
    });
    const c = new SessionController(deps);
    await c.boot();
    rotate!({ accessToken: "syt_new", refreshToken: "syr_new" });
    await vi.waitFor(() => expect(c.getSnapshot().session?.accessToken).toBe("syt_new"));
    expect(deps.saveSession).toHaveBeenLastCalledWith(
      expect.objectContaining({ accessToken: "syt_new", refreshToken: "syr_new" }),
    );
  });

  it("reports storage failures as an error state instead of a silent in-memory session", async () => {
    const deps = fakeDeps({
      loadSession: vi.fn(async () => {
        throw new (await import("../matrix/sessionStore")).SessionStorageUnavailableError();
      }),
    });
    const c = new SessionController(deps);
    await c.boot();
    expect(c.getSnapshot()).toMatchObject({
      status: "error",
      error: { code: "storage_unavailable" },
    });
  });

  it("surfaces a client start failure after authentication as an error state", async () => {
    const deps = fakeDeps({
      createMatrixClient: vi.fn(async () => {
        throw new Error("WebAssembly.instantiateStreaming(): blocked by CSP");
      }),
    });
    const c = new SessionController(deps);
    await c.boot();
    await c.signIn({ username: "alice", password: "correct horse battery" });
    expect(deps.saveSession).toHaveBeenCalled(); // the account/session is kept
    expect(c.getSnapshot().status).toBe("error");
    const logged = JSON.stringify((deps.logger.error as ReturnType<typeof vi.fn>).mock.calls);
    expect(logged).toContain("instantiateStreaming");
    expect(logged).not.toContain("correct horse battery");
  });

  it("routes to secure device setup when the device is not ready, then to ready after setup", async () => {
    const deps = fakeDeps({
      loadSession: vi.fn(async () => testSession),
      getCryptoReadiness: vi.fn(async () => ({
        crossSigningReady: false,
        secretStorageReady: false,
        keyBackupEnabled: false,
        accountHasCrossSigning: false,
      })),
      ensureCryptoReady: vi.fn(async (_c, _h, prompts) => {
        const pw = await prompts.requestPassword();
        expect(pw).toBe("pw");
        await prompts.showRecoveryKey("EsTc test key");
        return { outcome: "created" as const, keyBackupEnabled: true };
      }),
    });
    const c = new SessionController(deps);
    await c.boot();
    expect(c.getSnapshot().status).toBe("crypto_setup");
    const run = c.runSetup();
    await vi.waitFor(() => expect(c.getSnapshot().setup.phase).toBe("need_password"));
    c.submitSetupPassword("pw");
    await vi.waitFor(() => expect(c.getSnapshot().setup.phase).toBe("show_recovery_key"));
    c.acknowledgeRecoveryKey();
    await run;
    expect(c.getSnapshot().status).toBe("ready");
    expect(c.getSnapshot().setup).toMatchObject({ phase: "done", outcome: { outcome: "created" } });
  });

  describe("deferred secure setup (ADR-0003 D5, amended 2026-10-31)", () => {
    const notReady = () => ({
      crossSigningReady: false,
      secretStorageReady: false,
      keyBackupEnabled: false,
      accountHasCrossSigning: true,
    });
    const ready = () => ({
      crossSigningReady: true,
      secretStorageReady: true,
      keyBackupEnabled: true,
      accountHasCrossSigning: true,
    });

    it("records a skip in the session record and opens the app with the notice", async () => {
      const deps = fakeDeps({
        loadSession: vi.fn(async () => testSession),
        getCryptoReadiness: vi.fn(async () => notReady()),
        ensureCryptoReady: vi.fn(async (_c, _h, prompts) => {
          expect(await prompts.requestRecoveryKey(1)).toBeNull();
          return { outcome: "skipped_needs_verification" as const };
        }),
        now: () => 1_700_000_100_000,
      });
      const c = new SessionController(deps);
      await c.boot();
      expect(c.getSnapshot().status).toBe("crypto_setup");
      const run = c.runSetup();
      await vi.waitFor(() => expect(c.getSnapshot().setup.phase).toBe("need_recovery_key"));
      c.skipRecoveryKey();
      await run;
      expect(c.getSnapshot()).toMatchObject({ status: "ready", deviceUnverified: true });
      expect(deps.saveSession).toHaveBeenCalledWith(
        expect.objectContaining({ setupDeferredAt: 1_700_000_100_000 }),
      );
      expect(c.getSnapshot().session?.setupDeferredAt).toBe(1_700_000_100_000);
    });

    it("opens the app directly on a later start when the skip is recorded", async () => {
      const logged: string[] = [];
      const deps = fakeDeps({
        loadSession: vi.fn(async () => ({ ...testSession, setupDeferredAt: 1 })),
        getCryptoReadiness: vi.fn(async () => notReady()),
      });
      (deps.logger as unknown as { info: (m: string, d?: object) => void }).info = (m, d) =>
        void logged.push(`${m} ${JSON.stringify(d)}`);
      const c = new SessionController(deps);
      await c.boot();
      expect(c.getSnapshot()).toMatchObject({ status: "ready", deviceUnverified: true });
      expect(deps.ensureCryptoReady).not.toHaveBeenCalled();
      const line = logged.find((l) => l.startsWith("secure device setup deferred"));
      expect(line).toContain(testSession.deviceId);
      expect(line).not.toContain(testSession.accessToken);
    });

    it("still forces setup when the account has no cross-signing (first device)", async () => {
      const deps = fakeDeps({
        loadSession: vi.fn(async () => ({ ...testSession, setupDeferredAt: 1 })),
        getCryptoReadiness: vi.fn(async () => ({ ...notReady(), accountHasCrossSigning: false })),
      });
      const c = new SessionController(deps);
      await c.boot();
      expect(c.getSnapshot()).toMatchObject({ status: "crypto_setup", deviceUnverified: false });
    });

    it("clears a stale skip once the device is ready at start", async () => {
      const deps = fakeDeps({
        loadSession: vi.fn(async () => ({ ...testSession, setupDeferredAt: 1 })),
        getCryptoReadiness: vi.fn(async () => ready()),
      });
      const c = new SessionController(deps);
      await c.boot();
      expect(c.getSnapshot()).toMatchObject({ status: "ready", deviceUnverified: false });
      expect(c.getSnapshot().session?.setupDeferredAt).toBeUndefined();
      expect(deps.saveSession).toHaveBeenCalledWith(
        expect.not.objectContaining({ setupDeferredAt: expect.anything() }),
      );
    });

    it("reopens setup from the notice and clears it after a verification", async () => {
      const readiness = vi.fn(async () => notReady());
      const deps = fakeDeps({
        loadSession: vi.fn(async () => ({ ...testSession, setupDeferredAt: 1 })),
        getCryptoReadiness: readiness,
      });
      const c = new SessionController(deps);
      await c.boot();
      expect(c.getSnapshot().deviceUnverified).toBe(true);

      await c.refreshReadiness(); // still unverified: nothing changes
      expect(c.getSnapshot()).toMatchObject({ status: "ready", deviceUnverified: true });

      readiness.mockImplementation(async () => ready());
      await c.refreshReadiness();
      expect(c.getSnapshot()).toMatchObject({ status: "ready", deviceUnverified: false });
      expect(c.getSnapshot().session?.setupDeferredAt).toBeUndefined();

      c.reopenSetup(); // no longer unverified: ignored
      expect(c.getSnapshot().status).toBe("ready");
    });

    it("reopenSetup returns to the setup screen while unverified", async () => {
      const deps = fakeDeps({
        loadSession: vi.fn(async () => ({ ...testSession, setupDeferredAt: 1 })),
        getCryptoReadiness: vi.fn(async () => notReady()),
      });
      const c = new SessionController(deps);
      await c.boot();
      c.reopenSetup();
      expect(c.getSnapshot()).toMatchObject({ status: "crypto_setup", setup: { phase: "idle" } });
    });
  });
});

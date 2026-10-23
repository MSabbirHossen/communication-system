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
    c.subscribe(() => seen.push(c.getSnapshot().status));
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
});

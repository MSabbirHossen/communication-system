import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SessionController } from "./controller";
import type { TabLease } from "./tabLease";
import { fakeDeps, renderApp, testSession } from "../test/session";

/** A lease held elsewhere until takeOver is called; `lose()` simulates another tab stealing it. */
function contestedLease() {
  let onLost: () => void = () => {};
  const lease: TabLease = {
    held: false,
    takeOver: vi.fn(async () => {
      lease.held = true;
    }),
    release: vi.fn(() => {
      lease.held = false;
    }),
  };
  const acquire = vi.fn(async (_deviceId: string, lost: () => void) => {
    onLost = lost;
    return lease;
  });
  return { lease, acquire, lose: () => onLost() };
}

describe("one active tab per device", () => {
  it("a tab that cannot take the lease is blocked and creates no client", async () => {
    const { acquire } = contestedLease();
    const deps = fakeDeps({
      loadSession: vi.fn(async () => testSession),
      acquireTabLease: acquire,
    });
    const c = new SessionController(deps);
    await c.boot();
    expect(c.getSnapshot().status).toBe("blocked_by_other_tab");
    expect(c.getSnapshot().session).toEqual(testSession);
    expect(deps.createMatrixClient).not.toHaveBeenCalled();
    expect(acquire).toHaveBeenCalledWith(testSession.deviceId, expect.any(Function));
  });

  it("taking over starts the session in this tab", async () => {
    const { lease, acquire } = contestedLease();
    const deps = fakeDeps({
      loadSession: vi.fn(async () => testSession),
      acquireTabLease: acquire,
    });
    const c = new SessionController(deps);
    await c.boot();
    await c.takeOverTab();
    expect(lease.takeOver).toHaveBeenCalledTimes(1);
    expect(deps.createMatrixClient).toHaveBeenCalledTimes(1);
    expect(c.getSnapshot().status).toBe("ready");
  });

  it("taking over uses the token pair the other tab saved while this tab waited", async () => {
    const { acquire } = contestedLease();
    const rotated = { ...testSession, accessToken: "syt_rotated", refreshToken: "syr_rotated" };
    let reads = 0;
    const deps = fakeDeps({
      loadSession: vi.fn(async () => (reads++ === 0 ? testSession : rotated)),
      acquireTabLease: acquire,
    });
    const c = new SessionController(deps);
    await c.boot();
    expect(c.getSnapshot().session?.accessToken).toBe(testSession.accessToken);
    await c.takeOverTab();
    expect(deps.createMatrixClient).toHaveBeenCalledWith(
      expect.objectContaining({ session: expect.objectContaining({ accessToken: "syt_rotated" }) }),
    );
    expect(c.getSnapshot().status).toBe("ready");
    expect(c.getSnapshot().session?.refreshToken).toBe("syr_rotated");
  });

  it("losing the lease stops the client without clearing stores and blocks this tab", async () => {
    const { lease, acquire, lose } = contestedLease();
    lease.held = true;
    const deps = fakeDeps({
      loadSession: vi.fn(async () => testSession),
      acquireTabLease: acquire,
    });
    const c = new SessionController(deps);
    await c.boot();
    expect(c.getSnapshot().status).toBe("ready");
    const client = c.getSnapshot().client as unknown as { stopClient: ReturnType<typeof vi.fn> };
    lose();
    expect(c.getSnapshot().status).toBe("blocked_by_other_tab");
    expect(c.getSnapshot().client).toBeNull();
    expect(client.stopClient).toHaveBeenCalled();
    expect(deps.stopAndClearClient).not.toHaveBeenCalled();
    expect(deps.clearSession).not.toHaveBeenCalled();
  });

  it("signing out releases the lease", async () => {
    const { lease, acquire } = contestedLease();
    lease.held = true;
    const deps = fakeDeps({
      loadSession: vi.fn(async () => testSession),
      acquireTabLease: acquire,
    });
    const c = new SessionController(deps);
    await c.boot();
    await c.signOut();
    expect(lease.release).toHaveBeenCalledTimes(1);
    expect(c.getSnapshot().status).toBe("signed_out");
  });

  it("shows the other-tab screen with a take-over action on every guarded route", async () => {
    const { acquire } = contestedLease();
    const deps = fakeDeps({
      loadSession: vi.fn(async () => testSession),
      acquireTabLease: acquire,
    });
    const c = new SessionController(deps);
    await c.boot();
    renderApp("/chats", c);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/already open in another tab/i);
    await userEvent.setup().click(screen.getByRole("button", { name: "Use this tab" }));
    await waitFor(() => expect(c.getSnapshot().status).toBe("ready"));
    expect(await screen.findByRole("heading", { name: "Chats" })).toBeInTheDocument();
  });
});

import { describe, expect, it, vi } from "vitest";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SecurityNotice } from "../matrix/sessionEvents";
import type { FlowState, VerificationFlow } from "../matrix/verification";
import { controllerIn, fakeSecurityDeps, renderApp } from "../test/session";
import { SecurityStore } from "./security";

describe("SecurityStore", () => {
  it("keeps a stable snapshot, appends notices and dismisses by id", () => {
    const store = new SecurityStore(fakeSecurityDeps());
    const cb = vi.fn();
    store.subscribe(cb);
    const before = store.getSnapshot();
    expect(before).toEqual([]);
    expect(store.getSnapshot()).toBe(before);
    store.push({ kind: "backup_disabled" });
    store.push({ kind: "new_device", deviceIds: ["X"] });
    expect(cb).toHaveBeenCalledTimes(2);
    const [a, b] = store.getSnapshot();
    expect(a).toMatchObject({ kind: "backup_disabled" });
    expect(b).toMatchObject({ kind: "new_device", deviceIds: ["X"] });
    expect(a!.id).not.toBe(b!.id);
    store.dismiss(a!.id);
    expect(store.getSnapshot()).toEqual([b]);
  });

  it("subscribes when started, clears everything when stopped", () => {
    const stopEvents = vi.fn();
    const stopIncoming = vi.fn();
    const deps = fakeSecurityDeps({
      watchSecurityEvents: vi.fn(() => stopEvents),
      watchIncomingVerification: vi.fn(() => stopIncoming),
    });
    const store = new SecurityStore(deps);
    store.start({} as never);
    expect(deps.watchSecurityEvents).toHaveBeenCalledTimes(1);
    store.push({ kind: "identity_changed" });
    expect(store.getSnapshot()).toHaveLength(1);
    store.stop();
    expect(stopEvents).toHaveBeenCalledTimes(1);
    expect(stopIncoming).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toEqual([]);
  });
});

describe("security banners", () => {
  async function renderWithNotices() {
    let emit: ((n: SecurityNotice) => void) | undefined;
    const deps = fakeSecurityDeps({
      watchSecurityEvents: vi.fn((_c, cb) => {
        emit = cb;
        return () => {};
      }),
    });
    renderApp("/chats", await controllerIn("ready"), deps);
    await screen.findByRole("heading", { name: "Chats" });
    return (n: SecurityNotice) => act(() => emit!(n));
  }

  it("announces a new device with a link to the device list, and can be dismissed", async () => {
    const emit = await renderWithNotices();
    expect(screen.queryByRole("list", { name: "Security notices" })).toBeNull();
    emit({ kind: "new_device", deviceIds: ["TABLET9"] });
    const list = screen.getByRole("list", { name: "Security notices" });
    expect(list).toHaveTextContent(/new device signed in/i);
    expect(list).toHaveTextContent("TABLET9");
    expect(within(list).getByRole("link", { name: "Review devices" })).toHaveAttribute(
      "href",
      "/settings/devices",
    );
    await userEvent.setup().click(within(list).getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("list", { name: "Security notices" })).toBeNull();
  });

  it("announces identity changes and backup being disabled without claiming trust", async () => {
    const emit = await renderWithNotices();
    emit({ kind: "identity_changed" });
    emit({ kind: "backup_disabled" });
    const items = within(screen.getByRole("list", { name: "Security notices" })).getAllByRole(
      "listitem",
    );
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent(/security identity changed/i);
    expect(items[1]).toHaveTextContent(/backup is turned off/i);
    expect(screen.queryByText(/verified/i)).toBeNull();
  });
});

describe("verification requests from other users", () => {
  it("tracks the incoming flow per user and announces it with a link into the conversation", async () => {
    let incoming: ((f: VerificationFlow) => void) | undefined;
    const deps = fakeSecurityDeps({
      watchIncomingUserVerification: vi.fn((_c, cb) => {
        incoming = cb;
        return () => {};
      }),
    });
    renderApp("/chats", await controllerIn("ready"), deps);
    await screen.findByRole("heading", { name: "Chats" });
    const flow = userFlow("@bob:localhost", "!dm:localhost");
    act(() => incoming!(flow.flow));
    const list = screen.getByRole("list", { name: "Security notices" });
    expect(list).toHaveTextContent(/wants to verify their identity/i);
    expect(list).toHaveTextContent("@bob:localhost");
    expect(within(list).getByRole("link", { name: "Review" })).toHaveAttribute(
      "href",
      "/chats/!dm%3Alocalhost/verify",
    );
    flow.set({ phase: "done" });
    await waitFor(() =>
      expect(screen.queryByRole("list", { name: "Security notices" })).toBeNull(),
    );
  });

  it("the store hands the pending user flow to the verify screen and forgets it when finished", () => {
    const store = new SecurityStore(fakeSecurityDeps());
    const flow = userFlow("@bob:localhost", "!dm:localhost");
    (store as unknown as { onIncomingUser(f: VerificationFlow): void }).onIncomingUser(flow.flow);
    expect(store.incomingUserFor("@bob:localhost")).toBe(flow.flow);
    expect(store.getSnapshot()[0]).toMatchObject({
      kind: "user_verification_request",
      userId: "@bob:localhost",
      roomId: "!dm:localhost",
    });
    flow.set({ phase: "cancelled" });
    expect(store.incomingUserFor("@bob:localhost")).toBeUndefined();
    expect(store.getSnapshot()).toEqual([]);
  });
});

function userFlow(userId: string, roomId: string) {
  let state: FlowState = {
    phase: "requested",
    initiatedByMe: false,
    otherDeviceId: undefined,
    otherUserId: userId,
    roomId,
    emoji: null,
    decimal: null,
    cancelCode: null,
    cancelledByMe: false,
  };
  const listeners = new Set<() => void>();
  const set = (patch: Partial<FlowState>) =>
    act(() => {
      state = { ...state, ...patch };
      listeners.forEach((l) => l());
    });
  const flow: VerificationFlow = {
    getState: () => state,
    subscribe: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    accept: async () => {},
    startSas: async () => {},
    confirmMatch: async () => {},
    reportMismatch: () => {},
    cancel: async () => {},
    dispose: () => {},
  };
  return { flow, set };
}

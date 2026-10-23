import { describe, expect, it, vi } from "vitest";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FlowState, VerificationFlow } from "../matrix/verification";
import { controllerIn, fakeSecurityDeps, renderApp } from "../test/session";

const EMOJI: Array<[string, string]> = [
  ["🐶", "Dog"],
  ["🐱", "Cat"],
  ["🦁", "Lion"],
  ["🐎", "Horse"],
  ["🦄", "Unicorn"],
  ["🐷", "Pig"],
  ["🐘", "Elephant"],
];

/** A scriptable flow: the test moves it through phases as the SDK would. */
function fakeFlow(initial: Partial<FlowState> = {}) {
  let state: FlowState = {
    phase: "requested",
    initiatedByMe: true,
    otherDeviceId: "PHONE1",
    otherUserId: "@alice:localhost",
    roomId: undefined,
    emoji: null,
    decimal: null,
    cancelCode: null,
    cancelledByMe: false,
    ...initial,
  };
  const listeners = new Set<() => void>();
  const set = (patch: Partial<FlowState>) =>
    act(() => {
      state = { ...state, ...patch };
      listeners.forEach((l) => l());
    });
  const flow = {
    getState: () => state,
    subscribe: (cb: () => void) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    accept: vi.fn(async () => set({ phase: "ready" })),
    startSas: vi.fn(async () => set({ phase: "starting" })),
    confirmMatch: vi.fn(async () => set({ phase: "confirming" })),
    reportMismatch: vi.fn(() =>
      set({ phase: "cancelled", cancelCode: "m.mismatched_sas", cancelledByMe: true }),
    ),
    cancel: vi.fn(async () =>
      set({ phase: "cancelled", cancelCode: "m.user", cancelledByMe: true }),
    ),
    dispose: vi.fn(),
  } satisfies VerificationFlow;
  return { flow, set };
}

async function renderVerify(flow: VerificationFlow) {
  const c = await controllerIn("ready");
  const deps = fakeSecurityDeps({ requestVerification: vi.fn(async () => flow) });
  const view = renderApp("/settings/devices/verify/PHONE1", c, deps);
  await screen.findByRole("heading", { name: "Verify device" });
  return { view, deps };
}

describe("verify device screen (outgoing)", () => {
  it("requests verification, starts SAS when ready, shows emoji and reports a match", async () => {
    const { flow, set } = fakeFlow();
    const { deps } = await renderVerify(flow);
    expect(deps.requestVerification).toHaveBeenCalledWith(expect.anything(), "PHONE1");
    expect(await screen.findByRole("status")).toHaveTextContent(/waiting for your other device/i);

    set({ phase: "ready" });
    await waitFor(() => expect(flow.startSas).toHaveBeenCalledTimes(1));

    set({ phase: "show_sas", emoji: EMOJI, decimal: [1, 2, 3] });
    const list = screen.getByRole("list", { name: "Emoji to compare" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(7);
    expect(items[0]).toHaveTextContent("Dog");
    expect(items[6]).toHaveTextContent("Elephant");

    await userEvent.setup().click(screen.getByRole("button", { name: "They match" }));
    expect(flow.confirmMatch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent(
      /waiting for the other device to confirm/i,
    );
    // The emoji stay visible while waiting, so the user can still compare.
    expect(screen.getByRole("list", { name: "Emoji to compare" })).toBeInTheDocument();

    set({ phase: "done" });
    expect(screen.getByRole("status")).toHaveTextContent(/device verified/i);
    expect(screen.getByRole("link", { name: "Back to devices" })).toHaveAttribute(
      "href",
      "/settings/devices",
    );
  });

  it("a mismatch keeps the device unverified and says so", async () => {
    const { flow, set } = fakeFlow({ phase: "show_sas", emoji: EMOJI });
    await renderVerify(flow);
    await screen.findByRole("list", { name: "Emoji to compare" });
    await userEvent.setup().click(screen.getByRole("button", { name: "They don't match" }));
    expect(flow.reportMismatch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toHaveTextContent(/did not match/i);
    expect(screen.getByText("Not verified")).toBeInTheDocument();
    expect(screen.queryByText(/device verified/i)).toBeNull();
    set({ phase: "cancelled", cancelCode: "m.mismatched_sas" }); // idempotent re-render
    expect(screen.getByRole("alert")).toHaveTextContent(/did not match/i);
  });

  it("cancelling keeps the warning; a cancellation from the other side is explained", async () => {
    const { flow, set } = fakeFlow();
    await renderVerify(flow);
    await screen.findByRole("status");
    await userEvent.setup().click(screen.getByRole("button", { name: "Cancel" }));
    expect(flow.cancel).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toHaveTextContent(/cancelled/i);
    expect(screen.getByText("Not verified")).toBeInTheDocument();

    set({ phase: "cancelled", cancelCode: "m.timeout", cancelledByMe: false });
    expect(screen.getByRole("alert")).toHaveTextContent(/did not complete/i);
    expect(screen.getByRole("alert")).toHaveTextContent("m.timeout");
  });

  it("leaving the screen mid-flow cancels the request", async () => {
    const { flow } = fakeFlow();
    const { view } = await renderVerify(flow);
    await screen.findByRole("status");
    view.unmount();
    await waitFor(() => expect(flow.cancel).toHaveBeenCalledTimes(1));
    expect(flow.dispose).toHaveBeenCalled();
  });

  it("shows an error when the request cannot be created", async () => {
    const c = await controllerIn("ready");
    const deps = fakeSecurityDeps({
      requestVerification: vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    });
    renderApp("/settings/devices/verify/PHONE1", c, deps);
    expect(await screen.findByRole("alert")).toHaveTextContent(/cannot reach the server/i);
    expect(screen.getByRole("link", { name: "Back to devices" })).toBeInTheDocument();
  });
});

describe("incoming verification request", () => {
  it("shows a notice, lets the user review and accept, and the accepting side waits for SAS", async () => {
    const { flow, set } = fakeFlow({ initiatedByMe: false });
    let incoming: ((f: VerificationFlow) => void) | undefined;
    const deps = fakeSecurityDeps({
      watchIncomingVerification: vi.fn((_c, cb) => {
        incoming = cb;
        return () => {};
      }),
    });
    const c = await controllerIn("ready");
    renderApp("/chats", c, deps);
    await screen.findByRole("heading", { name: "Chats" });
    expect(screen.queryByRole("list", { name: "Security notices" })).toBeNull();

    act(() => incoming!(flow));
    const notices = screen.getByRole("list", { name: "Security notices" });
    expect(notices).toHaveTextContent(/wants to verify/i);
    expect(notices).toHaveTextContent("PHONE1");

    const user = userEvent.setup();
    await user.click(within(notices).getByRole("link", { name: "Review" }));
    await screen.findByRole("heading", { name: "Verify device" });
    expect(screen.getByText(/asked to verify with this one/i)).toBeInTheDocument();
    // No request was created: the pending incoming one is used.
    expect(deps.requestVerification).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(flow.accept).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent(/waiting for the other device to start/i);
    expect(flow.startSas).not.toHaveBeenCalled();

    set({ phase: "show_sas", emoji: EMOJI });
    expect(screen.getByRole("list", { name: "Emoji to compare" })).toBeInTheDocument();
    set({ phase: "done" });
    expect(screen.getByRole("status")).toHaveTextContent(/device verified/i);
    // The notice is gone once the flow finished.
    expect(screen.queryByRole("list", { name: "Security notices" })).toBeNull();
  });

  it("declining from the notice cancels the request", async () => {
    const { flow } = fakeFlow({ initiatedByMe: false });
    let incoming: ((f: VerificationFlow) => void) | undefined;
    const deps = fakeSecurityDeps({
      watchIncomingVerification: vi.fn((_c, cb) => {
        incoming = cb;
        return () => {};
      }),
    });
    renderApp("/chats", await controllerIn("ready"), deps);
    await screen.findByRole("heading", { name: "Chats" });
    act(() => incoming!(flow));
    await userEvent.setup().click(screen.getByRole("button", { name: "Decline" }));
    expect(flow.cancel).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("list", { name: "Security notices" })).toBeNull();
  });
});

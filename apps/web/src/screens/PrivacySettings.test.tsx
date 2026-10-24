import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MatrixClient } from "../matrix/client";
import { SETTINGS_EVENT_TYPE } from "../matrix/settings";
import { mockViewport } from "../test/setup";
import { controllerIn, fakeClient, renderApp } from "../test/session";

function settingsClient(initial?: unknown) {
  const base = fakeClient() as unknown as Record<string, unknown>;
  const state = { content: initial };
  const setAccountData = vi.fn(async (t: string, c: unknown) => {
    state.content = c;
    // The server echoes account data back through sync; the fake does it synchronously.
    (base.emit as (e: string, ...a: unknown[]) => void)("accountData", {
      getType: () => t,
      getContent: () => c,
    });
    return {};
  });
  const setSyncPresence = vi.fn(async () => {});
  const client = {
    ...base,
    getAccountData: (t: string) =>
      t === SETTINGS_EVENT_TYPE && state.content !== undefined
        ? { getContent: () => state.content }
        : undefined,
    setAccountData,
    setSyncPresence,
    setPresence: vi.fn(async () => {}),
  } as unknown as MatrixClient;
  return { client, setAccountData, setSyncPresence };
}

describe("privacy settings screen", () => {
  it("shows the defaults with explanations and writes changes as account data", async () => {
    mockViewport(true);
    const fake = settingsClient();
    const c = await controllerIn("ready", { createMatrixClient: vi.fn(async () => fake.client) });
    renderApp("/settings/privacy", c);
    const receipts = await screen.findByRole("switch", { name: "Share read receipts" });
    expect(receipts).toHaveAttribute("aria-checked", "false");
    expect(receipts).toHaveAccessibleDescription(/nobody sees when you read/i);
    const presence = screen.getByRole("switch", { name: "Share whether I am online" });
    expect(presence).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: /new message.*only/i })).toBeChecked();
    expect(screen.getByText(/never sees message content/i)).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(receipts);
    await waitFor(() =>
      expect(fake.setAccountData).toHaveBeenLastCalledWith(SETTINGS_EVENT_TYPE, {
        shareReadReceipts: true,
        sharePresence: true,
        notificationPreview: "generic",
      }),
    );
    await waitFor(() => expect(receipts).toHaveAttribute("aria-checked", "true"));
    await user.click(presence);
    await waitFor(() =>
      expect(fake.setAccountData).toHaveBeenLastCalledWith(SETTINGS_EVENT_TYPE, {
        shareReadReceipts: true,
        sharePresence: false,
        notificationPreview: "generic",
      }),
    );
    // The shell publishes the presence choice to the sync loop.
    await waitFor(() => expect(fake.setSyncPresence).toHaveBeenLastCalledWith("offline"));
    await user.click(screen.getByRole("radio", { name: "No notifications" }));
    await waitFor(() =>
      expect(fake.setAccountData).toHaveBeenLastCalledWith(
        SETTINGS_EVENT_TYPE,
        expect.objectContaining({ notificationPreview: "off" }),
      ),
    );
  });

  it("reflects stored settings on open", async () => {
    mockViewport(true);
    const fake = settingsClient({
      shareReadReceipts: true,
      sharePresence: false,
      notificationPreview: "sender",
    });
    const c = await controllerIn("ready", { createMatrixClient: vi.fn(async () => fake.client) });
    renderApp("/settings/privacy", c);
    expect(await screen.findByRole("switch", { name: "Share read receipts" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("switch", { name: "Share whether I am online" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(screen.getByRole("radio", { name: /new message from/i })).toBeChecked();
  });
});

describe("browser notification permission", () => {
  it("shows the browser state apart from the setting and asks only on the button", async () => {
    mockViewport(true);
    const requestPermission = vi.fn(async () => "granted" as const);
    class FakeNotification {
      static permission = "default";
      static requestPermission = requestPermission;
    }
    vi.stubGlobal("Notification", FakeNotification);
    try {
      const fake = settingsClient();
      const c = await controllerIn("ready", { createMatrixClient: vi.fn(async () => fake.client) });
      renderApp("/settings/privacy", c);
      expect(await screen.findByTestId("notification-permission")).toHaveTextContent(
        "not asked yet",
      );
      expect(requestPermission).not.toHaveBeenCalled();
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: "Allow browser notifications" }));
      await waitFor(() =>
        expect(screen.getByTestId("notification-permission")).toHaveTextContent("allowed"),
      );
      expect(requestPermission).toHaveBeenCalledTimes(1);
      expect(
        screen.queryByRole("button", { name: "Allow browser notifications" }),
      ).not.toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("says when the browser does not support notifications", async () => {
    mockViewport(true);
    vi.stubGlobal("Notification", undefined);
    try {
      const fake = settingsClient();
      const c = await controllerIn("ready", { createMatrixClient: vi.fn(async () => fake.client) });
      renderApp("/settings/privacy", c);
      expect(await screen.findByTestId("notification-permission")).toHaveTextContent(
        "not supported",
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

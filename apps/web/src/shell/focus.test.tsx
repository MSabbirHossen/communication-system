import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MatrixClient } from "../matrix/client";
import { mockViewport } from "../test/setup";
import { controllerIn, fakeClient, renderApp } from "../test/session";

function clientWithBlocked(userId: string) {
  const base = fakeClient() as unknown as Record<string, unknown>;
  return {
    ...base,
    getAccountData: (t: string) =>
      t === "m.ignored_user_list"
        ? { getContent: () => ({ ignored_users: { [userId]: {} } }) }
        : undefined,
    setIgnoredUsers: vi.fn(async () => ({})),
  } as unknown as MatrixClient;
}

describe("focus management", () => {
  it("moves focus to the new screen's heading after navigating", async () => {
    mockViewport(true);
    const c = await controllerIn("ready", { createMatrixClient: vi.fn(async () => fakeClient()) });
    renderApp("/settings", c);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("link", { name: /^Profile/ }));
    const heading = await screen.findByRole("heading", { name: "Profile" });
    await waitFor(() => expect(document.activeElement).toBe(heading));
  });

  it("returns focus to the opener when a dialog closes", async () => {
    mockViewport(true);
    const client = clientWithBlocked("@spam:localhost");
    const c = await controllerIn("ready", { createMatrixClient: vi.fn(async () => client) });
    renderApp("/settings/blocked", c);
    const user = userEvent.setup();
    const opener = await screen.findByRole("button", { name: "Unblock" });
    await user.click(opener);
    const dialog = await screen.findByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(document.activeElement).toBe(opener);
  });
});

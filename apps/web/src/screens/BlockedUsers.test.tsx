import { describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MatrixClient } from "../matrix/client";
import { mockViewport } from "../test/setup";
import { controllerIn, fakeClient, renderApp } from "../test/session";

function blockingClient(initial: string[]) {
  const base = fakeClient() as unknown as Record<string, unknown>;
  const state = { ignored: Object.fromEntries(initial.map((u) => [u, {}])) };
  const setIgnoredUsers = vi.fn(async (ids: string[]) => {
    state.ignored = Object.fromEntries(ids.map((u) => [u, {}]));
    (base.emit as (e: string, ...a: unknown[]) => void)("accountData", {
      getType: () => "m.ignored_user_list",
      getContent: () => ({ ignored_users: state.ignored }),
    });
    return {};
  });
  const client = {
    ...base,
    getAccountData: (t: string) =>
      t === "m.ignored_user_list"
        ? { getContent: () => ({ ignored_users: state.ignored }) }
        : undefined,
    setIgnoredUsers,
  } as unknown as MatrixClient;
  return { client, setIgnoredUsers };
}

describe("blocked users screen", () => {
  it("shows an empty state when nobody is blocked", async () => {
    mockViewport(true);
    const fake = blockingClient([]);
    const c = await controllerIn("ready", { createMatrixClient: vi.fn(async () => fake.client) });
    renderApp("/settings/blocked", c);
    expect(await screen.findByText(/nobody is blocked/i)).toBeInTheDocument();
  });

  it("lists blocked users and unblocks after confirmation", async () => {
    mockViewport(true);
    const fake = blockingClient(["@spam:localhost", "@troll:localhost"]);
    const c = await controllerIn("ready", { createMatrixClient: vi.fn(async () => fake.client) });
    renderApp("/settings/blocked", c);
    const list = await screen.findByRole("list", { name: "Blocked users" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("@spam:localhost");
    const user = userEvent.setup();
    await user.click(within(items[0]!).getByRole("button", { name: "Unblock" }));
    const dialog = await screen.findByRole("dialog", { name: "Unblock this person?" });
    expect(dialog).toHaveTextContent(/messages and invitations from them will be delivered again/i);
    await user.click(within(dialog).getByRole("button", { name: "Unblock" }));
    await waitFor(() => expect(fake.setIgnoredUsers).toHaveBeenCalledWith(["@troll:localhost"]));
    await waitFor(() =>
      expect(
        within(screen.getByRole("list", { name: "Blocked users" })).getAllByRole("listitem"),
      ).toHaveLength(1),
    );
  });
});

import { describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MatrixError } from "matrix-js-sdk";
import type { MatrixClient } from "../matrix/client";
import { mockViewport } from "../test/setup";
import { controllerIn, fakeClient, renderApp, testSession } from "../test/session";

function profileClient(opts: { displayname?: string; failSet?: boolean } = {}) {
  const base = fakeClient() as unknown as Record<string, unknown>;
  const setDisplayName = vi.fn(async () => {
    if (opts.failSet) throw new MatrixError({ errcode: "M_LIMIT_EXCEEDED" }, 429);
    return {};
  });
  const client = {
    ...base,
    getProfileInfo: vi.fn(async () =>
      opts.displayname === undefined ? {} : { displayname: opts.displayname },
    ),
    setDisplayName,
  } as unknown as MatrixClient;
  return { client, setDisplayName };
}

describe("settings hub", () => {
  it("links to every settings area and offers sign-out", async () => {
    mockViewport(true);
    renderApp("/settings", await controllerIn("ready"));
    const list = await screen.findByRole("list", { name: "Settings sections" });
    const links = within(list).getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/settings/profile",
      "/settings/privacy",
      "/settings/blocked",
      "/settings/devices",
      "/privacy",
    ]);
    expect(screen.getByText(testSession.userId)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out of this device" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Theme" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Language" })).toBeInTheDocument();
  });
});

describe("profile screen", () => {
  it("shows the identifier read-only and saves a changed display name", async () => {
    mockViewport(true);
    const fake = profileClient({ displayname: "Alice" });
    const c = await controllerIn("ready", { createMatrixClient: vi.fn(async () => fake.client) });
    renderApp("/settings/profile", c);
    const field = await screen.findByRole("textbox", { name: "Display name" });
    await waitFor(() => expect(field).toHaveValue("Alice"));
    expect(screen.getByText(testSession.userId)).toBeInTheDocument();
    expect(screen.getByText(/cannot be changed/i)).toBeInTheDocument();
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled(); // unchanged
    const user = userEvent.setup();
    await user.clear(field);
    await user.type(field, "  Alice Example ");
    await user.click(save);
    await waitFor(() => expect(fake.setDisplayName).toHaveBeenCalledWith("Alice Example"));
    expect(await screen.findByRole("status")).toHaveTextContent(/saved/i);
    expect(field).toHaveValue("Alice Example");
  });

  it("rejects an empty or overlong name inline without a request", async () => {
    mockViewport(true);
    const fake = profileClient({ displayname: "Alice" });
    const c = await controllerIn("ready", { createMatrixClient: vi.fn(async () => fake.client) });
    renderApp("/settings/profile", c);
    const field = await screen.findByRole("textbox", { name: "Display name" });
    await waitFor(() => expect(field).toHaveValue("Alice"));
    const user = userEvent.setup();
    await user.clear(field);
    await user.type(field, "   ");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(field).toHaveAccessibleDescription(/enter a display name/i);
    expect(fake.setDisplayName).not.toHaveBeenCalled();
  });

  it("maps a server error safely", async () => {
    mockViewport(true);
    const fake = profileClient({ displayname: "Alice", failSet: true });
    const c = await controllerIn("ready", { createMatrixClient: vi.fn(async () => fake.client) });
    renderApp("/settings/profile", c);
    const field = await screen.findByRole("textbox", { name: "Display name" });
    await waitFor(() => expect(field).toHaveValue("Alice"));
    const user = userEvent.setup();
    await user.type(field, " B");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/too many attempts/i);
  });
});

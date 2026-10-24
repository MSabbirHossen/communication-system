import { describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MatrixError } from "matrix-js-sdk";
import type { MatrixClient } from "../matrix/client";
import { controllerIn, renderApp, testSession } from "../test/session";

function devicesClient() {
  const devices = [
    {
      device_id: "DEVTEST",
      display_name: "Web · Chrome on Windows",
      last_seen_ts: 1_700_000_000_000,
    },
    { device_id: "PHONE1", display_name: "Phone", last_seen_ts: 1_690_000_000_000 },
  ];
  const keyMap = new Map([
    ["DEVTEST", { getFingerprint: () => "AAAABBBBCCCCDDDD" }],
    ["PHONE1", { getFingerprint: () => "EEEEFFFFGGGGHHHH" }],
  ]);
  const crypto = {
    getUserDeviceInfo: vi.fn(async () => new Map([[testSession.userId, keyMap]])),
    getDeviceVerificationStatus: vi.fn(async (_u: string, id: string) => ({
      isVerified: () => id === "DEVTEST",
      crossSigningVerified: id === "DEVTEST",
    })),
    getOwnDeviceKeys: vi.fn(async () => ({ ed25519: "AAAABBBBCCCCDDDD", curve25519: "x" })),
  };
  const deleteDevice = vi.fn(async (id: string, auth?: unknown) => {
    if (!auth) {
      throw new MatrixError(
        { errcode: "M_FORBIDDEN", session: "s", flows: [{ stages: ["m.login.password"] }] },
        401,
      );
    }
    const i = devices.findIndex((d) => d.device_id === id);
    if (i >= 0) devices.splice(i, 1);
    return {};
  });
  const deleteMultipleDevices = vi.fn(async (ids: string[], auth?: unknown) => {
    if (!auth) {
      throw new MatrixError(
        { errcode: "M_FORBIDDEN", session: "s", flows: [{ stages: ["m.login.password"] }] },
        401,
      );
    }
    for (const id of ids) {
      const i = devices.findIndex((d) => d.device_id === id);
      if (i >= 0) devices.splice(i, 1);
    }
    return {};
  });
  const setDeviceDetails = vi.fn(async (id: string, body: { display_name: string }) => {
    const d = devices.find((x) => x.device_id === id);
    if (d) d.display_name = body.display_name;
    return {};
  });
  const client = {
    getUserId: () => testSession.userId,
    getDeviceId: () => testSession.deviceId,
    getCrypto: () => crypto,
    getDevices: vi.fn(async () => ({ devices: [...devices] })),
    deleteDevice,
    setDeviceDetails,
    deleteMultipleDevices,
    stopClient: vi.fn(),
    clearStores: vi.fn(async () => {}),
  } as unknown as MatrixClient;
  return { client, deleteDevice, setDeviceDetails, deleteMultipleDevices };
}

async function renderDevices() {
  const fake = devicesClient();
  const c = await controllerIn("ready", { createMatrixClient: vi.fn(async () => fake.client) });
  renderApp("/settings/devices", c);
  await screen.findByRole("list", { name: "Your devices" });
  return fake;
}

describe("devices & security screen", () => {
  it("lists devices with the current one first and badges from SDK state", async () => {
    await renderDevices();
    const items = within(screen.getByRole("list", { name: "Your devices" })).getAllByRole(
      "listitem",
    );
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Web · Chrome on Windows");
    expect(items[0]).toHaveTextContent("This device");
    expect(items[0]).toHaveTextContent("Verified");
    expect(items[1]).toHaveTextContent("Phone");
    expect(items[1]).toHaveTextContent("Not verified");
    expect(items[1]).toHaveTextContent("EEEE FFFF GGGG HHHH");
    // Own identity panel
    expect(screen.getAllByText("AAAA BBBB CCCC DDDD").length).toBeGreaterThanOrEqual(2);
    // Only the other device can be revoked; the current one offers sign-out.
    expect(within(items[1]!).getByRole("button", { name: "Sign out device" })).toBeInTheDocument();
    expect(
      within(items[0]!).getByRole("button", { name: "Sign out of this device" }),
    ).toBeInTheDocument();
    expect(within(items[1]!).getByRole("link", { name: "Verify" })).toBeInTheDocument();
  });

  it("revokes another device after confirmation and password re-authentication", async () => {
    const { deleteDevice } = await renderDevices();
    const user = userEvent.setup();
    const items = within(screen.getByRole("list", { name: "Your devices" })).getAllByRole(
      "listitem",
    );
    await user.click(within(items[1]!).getByRole("button", { name: "Sign out device" }));
    const confirm = await screen.findByRole("dialog", { name: "Sign out this device?" });
    expect(confirm).toHaveTextContent("does not erase them");
    await user.click(within(confirm).getByRole("button", { name: "Sign out device" }));
    const reauth = await screen.findByRole("dialog", { name: "Confirm it's you" });
    await user.type(within(reauth).getByLabelText("Password"), "correct horse battery");
    await user.click(within(reauth).getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(deleteDevice).toHaveBeenCalledTimes(2));
    expect(deleteDevice.mock.calls[1]![1]).toMatchObject({ type: "m.login.password" });
    await waitFor(() =>
      expect(
        within(screen.getByRole("list", { name: "Your devices" })).getAllByRole("listitem"),
      ).toHaveLength(1),
    );
    expect(document.body.textContent).not.toContain("correct horse battery");
  });

  it("cancelling the password prompt leaves the device in place without an error", async () => {
    const { deleteDevice } = await renderDevices();
    const user = userEvent.setup();
    const items = within(screen.getByRole("list", { name: "Your devices" })).getAllByRole(
      "listitem",
    );
    await user.click(within(items[1]!).getByRole("button", { name: "Sign out device" }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Sign out device" }),
    );
    await screen.findByRole("dialog", { name: "Confirm it's you" });
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(deleteDevice).toHaveBeenCalledTimes(1); // only the unauthenticated attempt
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      within(screen.getByRole("list", { name: "Your devices" })).getAllByRole("listitem"),
    ).toHaveLength(2);
  });

  it("renames a device", async () => {
    const { setDeviceDetails } = await renderDevices();
    const user = userEvent.setup();
    const items = within(screen.getByRole("list", { name: "Your devices" })).getAllByRole(
      "listitem",
    );
    await user.click(within(items[1]!).getByRole("button", { name: "Rename" }));
    const input = screen.getByRole("textbox", { name: "Device name" });
    await user.clear(input);
    await user.type(input, "Old phone");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(setDeviceDetails).toHaveBeenCalledWith("PHONE1", { display_name: "Old phone" }),
    );
    expect(await screen.findByText("Old phone")).toBeInTheDocument();
  });
});

describe("sign out all other devices", () => {
  it("confirms, re-authenticates and removes every other device", async () => {
    const { deleteMultipleDevices } = await renderDevices();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Sign out all other devices" }));
    const confirm = await screen.findByRole("dialog", { name: "Sign out all other devices?" });
    await user.click(within(confirm).getByRole("button", { name: "Sign out all other devices" }));
    const reauth = await screen.findByRole("dialog", { name: "Confirm it's you" });
    await user.type(within(reauth).getByLabelText("Password"), "correct horse battery");
    await user.click(within(reauth).getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(deleteMultipleDevices).toHaveBeenCalledTimes(2));
    expect(deleteMultipleDevices.mock.calls[1]![0]).toEqual(["PHONE1"]);
    expect(await screen.findByRole("status")).toHaveTextContent("1 other device(s) signed out.");
    await waitFor(() =>
      expect(
        within(screen.getByRole("list", { name: "Your devices" })).getAllByRole("listitem"),
      ).toHaveLength(1),
    );
    expect(screen.queryByRole("button", { name: "Sign out all other devices" })).toBeNull();
  });
});

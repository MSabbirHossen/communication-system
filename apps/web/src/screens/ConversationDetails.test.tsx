import { describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EventEmitter } from "node:events";
import type { MatrixClient } from "matrix-js-sdk";
import { fakeRecipientCrypto } from "../matrix/recipientSecurity.test";
import { BOB, ME, fakeRoom } from "../matrix/rooms.test";
import { mockViewport } from "../test/setup";
import { controllerIn, fakeSecurityDeps, renderApp } from "../test/session";

function detailsClient(crypto: ReturnType<typeof fakeRecipientCrypto>) {
  const em = new EventEmitter();
  const room = fakeRoom({ roomId: "!r:localhost", lastActiveTs: 1 });
  const leave = vi.fn(async () => ({}));
  const client = {
    getUserId: () => ME,
    getDeviceId: () => "DEVTEST",
    getDomain: () => "localhost",
    getCrypto: () => ({ ...crypto, isEncryptionEnabledInRoom: async () => true }),
    on: (e: string, cb: (...a: unknown[]) => void) => em.on(e, cb),
    removeListener: (e: string, cb: (...a: unknown[]) => void) => em.removeListener(e, cb),
    getVisibleRooms: () => [room],
    getRoom: (id: string) => (id === room.roomId ? room : null),
    getAccountData: (t: string) =>
      t === "m.direct" ? { getContent: () => ({ [BOB]: [room.roomId] }) } : undefined,
    getSyncState: () => "SYNCING",
    leave,
  } as unknown as MatrixClient;
  return { client, leave, room };
}

async function renderDetails(crypto: ReturnType<typeof fakeRecipientCrypto>) {
  mockViewport(true);
  const fake = detailsClient(crypto);
  const c = await controllerIn("ready", { createMatrixClient: vi.fn(async () => fake.client) });
  renderApp("/chats/!r:localhost/details", c);
  await screen.findByRole("heading", { name: "Conversation details" });
  return fake;
}

describe("conversation details", () => {
  it("shows the identity state, encryption state and each device with SDK-derived badges", async () => {
    await renderDetails(
      fakeRecipientCrypto({
        devices: [
          { id: "PHONE", name: "Phone", fingerprint: "AAAABBBBCCCCDDDD", verified: false },
          { id: "LAPTOP", name: "Laptop", fingerprint: "EEEEFFFFGGGGHHHH", verified: true },
        ],
      }),
    );
    const identity = screen.getByRole("region", { name: "Identity" });
    expect(identity).toHaveTextContent("Bob");
    expect(identity).toHaveTextContent(BOB);
    await waitFor(() => expect(identity).toHaveTextContent("Identity not verified"));
    expect(screen.getByRole("region", { name: "Encryption" })).toHaveTextContent("Encrypted");
    const list = await screen.findByRole("list", { name: "Their devices" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Laptop");
    expect(items[0]).toHaveTextContent("Verified");
    expect(items[1]).toHaveTextContent("Phone");
    expect(items[1]).toHaveTextContent("Not verified");
    expect(items[1]).toHaveTextContent("AAAA BBBB CCCC DDDD");
  });

  it("explains a changed identity without claiming trust", async () => {
    await renderDetails(fakeRecipientCrypto({ wasVerified: true }));
    const identity = screen.getByRole("region", { name: "Identity" });
    await waitFor(() => expect(identity).toHaveTextContent("Identity changed"));
    expect(identity).toHaveTextContent(/verify them again/i);
    expect(identity).not.toHaveTextContent(/^.*\bVerified\b(?!.*changed)/);
  });

  it("leaves the conversation after confirmation", async () => {
    const { leave } = await renderDetails(fakeRecipientCrypto({}));
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Leave conversation" }));
    const dialog = await screen.findByRole("dialog", { name: "Leave this conversation?" });
    await user.click(within(dialog).getByRole("button", { name: "Leave conversation" }));
    await waitFor(() => expect(leave).toHaveBeenCalledWith("!r:localhost"));
    expect(await screen.findByRole("region", { name: "Chats" })).toBeInTheDocument();
  });
});

describe("verifying the other person", () => {
  it("links to the in-room verification flow and starts a request for that room", async () => {
    mockViewport(true);
    const fake = detailsClient(
      fakeRecipientCrypto({ devices: [{ id: "PHONE", verified: false }] }),
    );
    const c = await controllerIn("ready", { createMatrixClient: vi.fn(async () => fake.client) });
    const requestUserVerification = vi.fn(async () => {
      throw new Error("not started in this test");
    });
    renderApp("/chats/!r:localhost/details", c, fakeSecurityDeps({ requestUserVerification }));
    const link = await screen.findByRole("link", { name: "Verify this person" });
    expect(link).toHaveAttribute("href", "/chats/!r%3Alocalhost/verify");
    await userEvent.setup().click(link);
    expect(await screen.findByRole("heading", { name: "Verify Bob" })).toBeInTheDocument();
    await waitFor(() =>
      expect(requestUserVerification).toHaveBeenCalledWith(fake.client, BOB, "!r:localhost"),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(/something went wrong/i);
  });
});

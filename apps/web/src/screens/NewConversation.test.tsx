import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EventEmitter } from "node:events";
import { MatrixError } from "matrix-js-sdk";
import type { MatrixClient, Room } from "matrix-js-sdk";
import { BOB, ME, fakeRoom } from "../matrix/rooms.test";
import { controllerIn, renderApp } from "../test/session";

function peopleClient(opts: { rooms?: Room[]; direct?: Record<string, string[]> } = {}) {
  const em = new EventEmitter();
  const state = { direct: opts.direct ?? {}, rooms: opts.rooms ?? [] };
  const getProfileInfo = vi.fn(async (userId: string) => {
    if (userId === BOB) return { displayname: "Bob Example" };
    if (userId === "@flaky:localhost") throw new MatrixError({ errcode: "M_LIMIT_EXCEEDED" }, 429);
    throw new MatrixError({ errcode: "M_NOT_FOUND", error: "Profile not found" }, 404);
  });
  const createRoom = vi.fn(async (_opts: Record<string, unknown>) => ({
    room_id: "!new:localhost",
  }));
  const setAccountData = vi.fn(async (_t: string, c: Record<string, string[]>) => {
    state.direct = c;
    return {};
  });
  const client = {
    getUserId: () => ME,
    getDeviceId: () => "DEVTEST",
    getDomain: () => "localhost",
    on: (e: string, cb: (...a: unknown[]) => void) => em.on(e, cb),
    removeListener: (e: string, cb: (...a: unknown[]) => void) => em.removeListener(e, cb),
    getVisibleRooms: () => state.rooms,
    getRoom: (id: string) => state.rooms.find((r) => r.roomId === id) ?? null,
    getAccountData: (t: string) =>
      t === "m.direct" ? { getContent: () => state.direct } : undefined,
    setAccountData,
    getProfileInfo,
    createRoom,
    getSyncState: () => "SYNCING",
  } as unknown as MatrixClient;
  return { client, getProfileInfo, createRoom, setAccountData };
}

async function renderPeople(path = "/people", opts = {}) {
  const fake = peopleClient(opts);
  const c = await controllerIn("ready", { createMatrixClient: vi.fn(async () => fake.client) });
  renderApp(path, c);
  await screen.findByRole("heading", { name: "New conversation" });
  return fake;
}

describe("new conversation", () => {
  it("resolves a local username, shows the display name and creates an encrypted direct room", async () => {
    const { getProfileInfo, createRoom, setAccountData } = await renderPeople();
    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox", { name: "Username or Matrix ID" }), "bob");
    await user.click(screen.getByRole("button", { name: "Look up" }));
    expect(getProfileInfo).toHaveBeenCalledWith(BOB);
    const card = await screen.findByRole("status");
    expect(card).toHaveTextContent("Bob Example");
    expect(card).toHaveTextContent(BOB);
    expect(card).toHaveTextContent(/not proof of who this is/i);
    await user.click(screen.getByRole("button", { name: "Start encrypted conversation" }));
    await waitFor(() => expect(createRoom).toHaveBeenCalledTimes(1));
    expect(createRoom.mock.calls[0]![0]).toMatchObject({
      is_direct: true,
      invite: [BOB],
      preset: "trusted_private_chat",
      initial_state: [
        { type: "m.room.encryption", content: { algorithm: "m.megolm.v1.aes-sha2" } },
      ],
    });
    expect(setAccountData).toHaveBeenCalledWith("m.direct", { [BOB]: ["!new:localhost"] });
  });

  it("rejects invalid identifiers and the user's own id without a network call", async () => {
    const { getProfileInfo } = await renderPeople();
    const user = userEvent.setup();
    const field = screen.getByRole("textbox", { name: "Username or Matrix ID" });
    await user.type(field, "Not Valid!");
    await user.click(screen.getByRole("button", { name: "Look up" }));
    expect(field).toHaveAccessibleDescription(/not a valid username/i);
    await user.clear(field);
    await user.type(field, ME);
    await user.click(screen.getByRole("button", { name: "Look up" }));
    expect(field).toHaveAccessibleDescription(/your own account/i);
    expect(getProfileInfo).not.toHaveBeenCalled();
  });

  it("explains an unknown account and maps server errors safely", async () => {
    await renderPeople();
    const user = userEvent.setup();
    const field = screen.getByRole("textbox", { name: "Username or Matrix ID" });
    await user.type(field, "@nobody:localhost");
    await user.click(screen.getByRole("button", { name: "Look up" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No account was found for");
    expect(screen.getByRole("alert")).toHaveTextContent("@nobody:localhost");
    await user.clear(field);
    await user.type(field, "flaky");
    await user.click(screen.getByRole("button", { name: "Look up" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/too many attempts/i);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("offers to open an existing conversation instead of creating a second room", async () => {
    const { createRoom } = await renderPeople("/chats/new", {
      rooms: [fakeRoom({ roomId: "!existing", lastActiveTs: 1 })],
      direct: { [BOB]: ["!existing"] },
    });
    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox", { name: "Username or Matrix ID" }), "bob");
    await user.click(screen.getByRole("button", { name: "Look up" }));
    const card = await screen.findByRole("status");
    expect(card).toHaveTextContent(/already have a conversation/i);
    await user.click(screen.getByRole("button", { name: "Open conversation" }));
    expect(createRoom).not.toHaveBeenCalled();
    // The memory router shows the existing conversation.
    expect(await screen.findByRole("heading", { name: "Bob" })).toBeInTheDocument();
  });
});

import { describe, expect, it, vi } from "vitest";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EventEmitter } from "node:events";
import type { MatrixClient, Room } from "matrix-js-sdk";
import { BOB, ME, fakeRoom } from "../matrix/rooms.test";
import { mockViewport } from "../test/setup";
import { controllerIn, renderApp } from "../test/session";
import { formatConversationTime } from "./Chats";

function chatsClient(rooms: Room[], direct: Record<string, string[]> = {}) {
  const em = new EventEmitter();
  const state = { direct, rooms, sync: "SYNCING" as string | null };
  const setAccountData = vi.fn(async (t: string, c: Record<string, string[]>) => {
    state.direct = c;
    em.emit("accountData", { getType: () => t, getContent: () => c });
    return {};
  });
  const joinRoom = vi.fn(async () => ({}));
  const leave = vi.fn(async () => ({}));
  const retryImmediately = vi.fn(() => true);
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
    joinRoom,
    leave,
    getSyncState: () => state.sync,
    retryImmediately,
    getUser: () => null,
    setSyncPresence: vi.fn(async () => {}),
  } as unknown as MatrixClient;
  return { client, em, state, setAccountData, joinRoom, leave, retryImmediately };
}

async function renderChats(path: string, rooms: Room[], direct: Record<string, string[]> = {}) {
  const fake = chatsClient(rooms, direct);
  const c = await controllerIn("ready", { createMatrixClient: vi.fn(async () => fake.client) });
  const view = renderApp(path, c);
  return { ...fake, view };
}

const today = Date.now();

describe("conversation list", () => {
  it("shows an empty state for a first-time user", async () => {
    mockViewport(true);
    await renderChats("/chats", []);
    expect(await screen.findByText("No conversations yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "New conversation" })).toHaveAttribute(
      "href",
      "/chats/new",
    );
    expect(screen.getByRole("region", { name: "Select a conversation" })).toBeInTheDocument();
  });

  it("lists conversations newest first with previews, times and unread counts", async () => {
    mockViewport(true);
    await renderChats(
      "/chats",
      [
        fakeRoom({
          roomId: "!a",
          lastActiveTs: today - 1000,
          unread: 2,
          events: [{ type: "m.room.message", sender: BOB, body: "see you at 9" }],
        }),
        fakeRoom({
          roomId: "!c",
          lastActiveTs: today - 5000,
          members: [{ userId: ME }, { userId: "@carol:localhost", name: "Carol" }],
          events: [{ type: "m.room.message", sender: ME, body: "thanks" }],
        }),
      ],
      { [BOB]: ["!a"], "@carol:localhost": ["!c"] },
    );
    const list = await screen.findByRole("list", { name: "Conversations" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Bob");
    expect(items[0]).toHaveTextContent("see you at 9");
    expect(items[0]).toHaveTextContent("2 unread");
    expect(items[1]).toHaveTextContent("Carol");
    expect(items[1]).toHaveTextContent("You: thanks");
    expect(items[1]).not.toHaveTextContent("unread");
    expect(within(items[0]!).getByRole("link")).toHaveAttribute("href", "/chats/!a");
  });

  it("filters by name or identifier", async () => {
    mockViewport(true);
    await renderChats(
      "/chats",
      [
        fakeRoom({ roomId: "!a", lastActiveTs: 2 }),
        fakeRoom({
          roomId: "!c",
          lastActiveTs: 1,
          members: [{ userId: ME }, { userId: "@carol:localhost", name: "Carol" }],
        }),
      ],
      { [BOB]: ["!a"], "@carol:localhost": ["!c"] },
    );
    await screen.findByRole("list", { name: "Conversations" });
    const user = userEvent.setup();
    await user.type(screen.getByRole("searchbox", { name: "Search conversations" }), "car");
    const items = within(screen.getByRole("list", { name: "Conversations" })).getAllByRole(
      "listitem",
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent("Carol");
    await user.clear(screen.getByRole("searchbox", { name: "Search conversations" }));
    await user.type(screen.getByRole("searchbox", { name: "Search conversations" }), "nobody");
    expect(screen.getByRole("status")).toHaveTextContent(/no conversations match/i);
  });

  it("shows invitations with accept and decline, and records the room on accept", async () => {
    mockViewport(true);
    const invite = fakeRoom({
      roomId: "!inv",
      myMembership: "invite",
      dmInviter: BOB,
      members: [
        { userId: ME, membership: "invite" },
        { userId: BOB, name: "Bob" },
      ],
      lastActiveTs: today,
    });
    const { joinRoom, leave, setAccountData } = await renderChats("/chats", [invite]);
    const item = within(await screen.findByRole("list", { name: "Conversations" })).getAllByRole(
      "listitem",
    )[0]!;
    expect(item).toHaveTextContent("Invitation");
    expect(item).toHaveTextContent(BOB);
    const user = userEvent.setup();
    await user.click(within(item).getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(joinRoom).toHaveBeenCalledWith("!inv"));
    expect(setAccountData).toHaveBeenCalledWith("m.direct", { [BOB]: ["!inv"] });
    // Accepting opens the conversation route.
    expect(await screen.findByRole("heading", { name: "Bob" })).toBeInTheDocument();
    expect(leave).not.toHaveBeenCalled();
  });

  it("declining an invitation leaves the room", async () => {
    mockViewport(true);
    const invite = fakeRoom({
      roomId: "!inv",
      myMembership: "invite",
      dmInviter: BOB,
      members: [{ userId: ME, membership: "invite" }, { userId: BOB }],
    });
    const { leave, joinRoom } = await renderChats("/chats", [invite]);
    const item = within(await screen.findByRole("list", { name: "Conversations" })).getAllByRole(
      "listitem",
    )[0]!;
    await userEvent.setup().click(within(item).getByRole("button", { name: "Decline" }));
    await waitFor(() => expect(leave).toHaveBeenCalledWith("!inv"));
    expect(joinRoom).not.toHaveBeenCalled();
  });

  it("re-renders when the client reports room changes", async () => {
    mockViewport(true);
    const { em, state } = await renderChats("/chats", []);
    await screen.findByText("No conversations yet");
    state.rooms = [fakeRoom({ roomId: "!a", lastActiveTs: 1 })];
    state.direct = { [BOB]: ["!a"] };
    await act(async () => {
      em.emit("Room", state.rooms[0]);
    });
    expect(await screen.findByRole("list", { name: "Conversations" })).toHaveTextContent("Bob");
  });

  it("offers a retry when sync is failing", async () => {
    mockViewport(true);
    const { em, state, retryImmediately } = await renderChats("/chats", []);
    await screen.findByText("No conversations yet");
    state.sync = "ERROR";
    await act(async () => {
      em.emit("sync", "ERROR");
    });
    expect(screen.getByRole("alert")).toHaveTextContent(/cannot reach the server/i);
    await userEvent.setup().click(screen.getByRole("button", { name: "Retry now" }));
    expect(retryImmediately).toHaveBeenCalled();
  });

  it("below the desktop breakpoint, New conversation replaces the list", async () => {
    mockViewport(false);
    await renderChats("/chats/new", []);
    expect(await screen.findByRole("heading", { name: "New conversation" })).toBeInTheDocument();
    expect(screen.queryByText("No conversations yet")).toBeNull();
  });

  it("below the desktop breakpoint, a selected conversation replaces the list", async () => {
    mockViewport(false);
    await renderChats("/chats/!a", [fakeRoom({ roomId: "!a" })], { [BOB]: ["!a"] });
    expect(await screen.findByRole("heading", { name: "Bob" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Chats" })).toBeNull();
    expect(document.querySelector('[data-panes="1"]')).not.toBeNull();
  });
});

describe("formatConversationTime", () => {
  it("uses the time today, day and month this year, and a date otherwise", () => {
    const now = new Date(2026, 9, 23, 14, 30).getTime();
    expect(formatConversationTime(new Date(2026, 9, 23, 9, 5).getTime(), now)).toMatch(/9:05/);
    expect(formatConversationTime(new Date(2026, 2, 3).getTime(), now)).toMatch(/Mar/);
    expect(formatConversationTime(new Date(2025, 2, 3).getTime(), now)).toMatch(/2025/);
    expect(formatConversationTime(0, now)).toBe("");
    expect(formatConversationTime(Number.MIN_SAFE_INTEGER, now)).toBe("");
    expect(formatConversationTime(Number.NaN, now)).toBe("");
  });
});

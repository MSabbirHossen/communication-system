import { describe, expect, it, vi } from "vitest";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EventEmitter } from "node:events";
import { EventStatus, type MatrixClient, type MatrixEvent, type Room } from "matrix-js-sdk";
import { BOB, ME, fakeEvent } from "../matrix/timeline.test";
import { mockViewport } from "../test/setup";
import { controllerIn, renderApp } from "../test/session";

/** A room that satisfies both the conversation model and the timeline. */
function chatRoom(
  opts: {
    roomId?: string;
    encrypted?: boolean;
    events?: MatrixEvent[];
    membership?: "join" | "invite";
    backToken?: string | null;
  } = {},
) {
  const room = {
    roomId: opts.roomId ?? "!r:localhost",
    events: opts.events ?? [],
    backToken: opts.backToken ?? null,
    getMyMembership: () => opts.membership ?? "join",
    getMembers: () => [
      { userId: ME, name: "Alice", membership: opts.membership ?? "join" },
      { userId: BOB, name: "Bob", membership: "join" },
    ],
    getMember: (id: string) =>
      id === BOB
        ? { userId: BOB, name: "Bob", membership: "join", events: {} }
        : { userId: ME, name: "Alice", membership: "join", events: {} },
    getDMInviter: () => (opts.membership === "invite" ? BOB : undefined),
    getLastActiveTimestamp: () => 1,
    getUnreadNotificationCount: () => 0,
    hasEncryptionStateEvent: () => opts.encrypted ?? true,
    getLiveTimeline: () => ({
      getEvents: () => room.events,
      getPaginationToken: () => room.backToken,
    }),
    findEventById: (id: string) => room.events.find((e) => e.getId() === id),
  };
  return room as unknown as Room & typeof room;
}

function chatClient(room: Room, opts: { encryptionEnabled?: boolean } = {}) {
  const em = new EventEmitter();
  const sendTextMessage = vi.fn(async () => ({ event_id: "$sent" }));
  const resendEvent = vi.fn(async () => ({ event_id: "$resent" }));
  const cancelPendingEvent = vi.fn();
  const joinRoom = vi.fn(async () => ({}));
  const leave = vi.fn(async () => ({}));
  const scrollback = vi.fn(async (r: Room) => r);
  const sendReadReceipt = vi.fn(async (_ev: MatrixEvent, _type?: string) => ({}));
  const client = {
    getUserId: () => ME,
    getDeviceId: () => "DEVTEST",
    getDomain: () => "localhost",
    getCrypto: () => ({ isEncryptionEnabledInRoom: async () => opts.encryptionEnabled ?? true }),
    on: (e: string, cb: (...a: unknown[]) => void) => em.on(e, cb),
    removeListener: (e: string, cb: (...a: unknown[]) => void) => em.removeListener(e, cb),
    getVisibleRooms: () => [room],
    getRoom: (id: string) => (id === room.roomId ? room : null),
    getAccountData: (t: string) =>
      t === "m.direct" ? { getContent: () => ({ [BOB]: [room.roomId] }) } : undefined,
    setAccountData: vi.fn(async () => ({})),
    getSyncState: () => "SYNCING",
    sendTextMessage,
    resendEvent,
    cancelPendingEvent,
    joinRoom,
    leave,
    scrollback,
    sendReadReceipt,
  } as unknown as MatrixClient;
  return {
    client,
    em,
    sendTextMessage,
    resendEvent,
    cancelPendingEvent,
    joinRoom,
    leave,
    scrollback,
    sendReadReceipt,
  };
}

async function renderChat(
  room: Room & { events: MatrixEvent[] },
  opts: { encryptionEnabled?: boolean } = {},
) {
  mockViewport(true);
  const fake = chatClient(room, opts);
  const c = await controllerIn("ready", { createMatrixClient: vi.fn(async () => fake.client) });
  renderApp(`/chats/${room.roomId}`, c);
  await screen.findByRole("heading", { name: "Bob" });
  return fake;
}

describe("conversation view", () => {
  it("renders the header, encryption badge, history with date separators and statuses", async () => {
    const room = chatRoom({
      events: [
        fakeEvent({
          id: "$a",
          sender: BOB,
          ts: new Date(2026, 9, 22, 9, 0).getTime(),
          content: { msgtype: "m.text", body: "yesterday" },
        }),
        fakeEvent({
          id: "$b",
          sender: ME,
          ts: new Date(2026, 9, 23, 9, 0).getTime(),
          content: { msgtype: "m.text", body: "today" },
          status: EventStatus.SENT,
        }),
        fakeEvent({
          id: "$c",
          type: "m.room.encrypted",
          sender: BOB,
          ts: new Date(2026, 9, 23, 9, 1).getTime(),
          decryptionFailure: "HISTORICAL_MESSAGE_NO_KEY_BACKUP",
        }),
      ],
    });
    await renderChat(room);
    expect(screen.getByText("Encrypted")).toBeInTheDocument();
    expect(screen.getByText(BOB)).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Messages" });
    expect(list).toHaveTextContent("yesterday");
    expect(list).toHaveTextContent("today");
    expect(list).toHaveTextContent("Sent");
    expect(list).toHaveTextContent(/unable to decrypt/i);
    expect(list).toHaveTextContent(/before this device was set up/i);
    // Two different days → two date separators.
    expect(list.querySelectorAll(".messages__date")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Details" })).toHaveAttribute(
      "href",
      `/chats/${encodeURIComponent(room.roomId)}/details`,
    );
  });

  it("sends with Enter, shows the local echo as pending, then sent", async () => {
    const room = chatRoom();
    const { sendTextMessage, em } = await renderChat(room);
    const user = userEvent.setup();
    const box = screen.getByRole("textbox", { name: "Message" });
    await user.type(box, "hello bob{Enter}");
    expect(sendTextMessage).toHaveBeenCalledWith(room.roomId, "hello bob");
    expect(box).toHaveValue("");
    // The SDK adds the local echo to the live timeline with a pending status.
    const echo = fakeEvent({
      id: "~local",
      sender: ME,
      status: EventStatus.SENDING,
      content: { msgtype: "m.text", body: "hello bob" },
    });
    await act(async () => {
      room.events.push(echo);
      em.emit("Room.timeline", echo, room, false, false, {});
    });
    const list = screen.getByRole("list", { name: "Messages" });
    expect(list).toHaveTextContent("hello bob");
    expect(list).toHaveTextContent("Sending…");
    await act(async () => {
      echo.status = EventStatus.SENT;
      em.emit("Room.localEchoUpdated", echo, room, "~local", EventStatus.SENDING);
    });
    expect(list).toHaveTextContent("Sent");
    expect(list).not.toHaveTextContent("Sending…");
  });

  it("Shift+Enter inserts a newline without sending", async () => {
    const room = chatRoom();
    const { sendTextMessage } = await renderChat(room);
    const user = userEvent.setup();
    const box = screen.getByRole("textbox", { name: "Message" });
    await user.type(box, "line one{Shift>}{Enter}{/Shift}line two");
    expect(sendTextMessage).not.toHaveBeenCalled();
    expect(box).toHaveValue("line one\nline two");
  });

  it("a failed send offers retry (same event) and delete", async () => {
    const failed = fakeEvent({
      id: "~f",
      sender: ME,
      status: EventStatus.NOT_SENT,
      content: { msgtype: "m.text", body: "lost" },
    });
    const room = chatRoom({ events: [failed] });
    const { resendEvent, cancelPendingEvent } = await renderChat(room);
    const list = screen.getByRole("list", { name: "Messages" });
    expect(list).toHaveTextContent("Not sent");
    const user = userEvent.setup();
    await user.click(within(list).getByRole("button", { name: "Retry" }));
    expect(resendEvent).toHaveBeenCalledWith(failed, room);
    await user.click(within(list).getByRole("button", { name: "Delete" }));
    expect(cancelPendingEvent).toHaveBeenCalledWith(failed);
  });

  it("never sends into an unencrypted room: the composer is disabled with an explanation", async () => {
    const room = chatRoom({ encrypted: false });
    const { sendTextMessage } = await renderChat(room);
    expect(screen.getByText("Not encrypted")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Message" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(/never sent unencrypted/i);
    expect(sendTextMessage).not.toHaveBeenCalled();
  });

  it("reports a refusal from the send guard even if the room state looked encrypted", async () => {
    const room = chatRoom();
    const { sendTextMessage } = await renderChat(room, { encryptionEnabled: false });
    await userEvent.setup().type(screen.getByRole("textbox", { name: "Message" }), "x{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent(/never sent unencrypted/i);
    expect(sendTextMessage).not.toHaveBeenCalled();
  });

  it("shows an invitation prompt instead of the composer for an invited room", async () => {
    const room = chatRoom({ membership: "invite" });
    const { joinRoom, sendReadReceipt } = await renderChat(room);
    expect(screen.queryByRole("textbox", { name: "Message" })).toBeNull();
    const detail = screen.getByRole("region", { name: "Select a conversation" });
    await userEvent.setup().click(within(detail).getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(joinRoom).toHaveBeenCalledWith(room.roomId));
    expect(sendReadReceipt).not.toHaveBeenCalled();
  });

  it("shows a not-found state for an unknown room", async () => {
    mockViewport(true);
    const fake = chatClient(chatRoom());
    const c = await controllerIn("ready", { createMatrixClient: vi.fn(async () => fake.client) });
    renderApp("/chats/!nope:localhost", c);
    expect(await screen.findByRole("alert")).toHaveTextContent(/conversation not found/i);
  });
});

describe("history and read state", () => {
  it("offers to load older messages while a back-pagination token exists", async () => {
    const room = chatRoom({ backToken: "t1", events: [fakeEvent({ id: "$1" })] });
    const { scrollback, em } = await renderChat(room);
    const button = screen.getByRole("button", { name: "Load older messages" });
    scrollback.mockImplementationOnce(async (r: Room) => {
      (r as typeof room).backToken = null;
      const older = fakeEvent({ id: "$0", content: { msgtype: "m.text", body: "older" } });
      (r as typeof room).events.unshift(older);
      em.emit("Room.timeline", older, r, true, false, {}); // the SDK announces paginated events
      return r;
    });
    await userEvent.setup().click(button);
    await waitFor(() => expect(scrollback).toHaveBeenCalledWith(room, 30));
    expect(screen.getByRole("list", { name: "Messages" })).toHaveTextContent("older");
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Load older messages" })).toBeNull(),
    );
  });

  it("marks the latest accepted message read with a private receipt after opening", async () => {
    const last = fakeEvent({ id: "$last" });
    const room = chatRoom({ events: [fakeEvent({ id: "$first" }), last] });
    const { sendReadReceipt } = await renderChat(room);
    await waitFor(() => expect(sendReadReceipt).toHaveBeenCalledWith(last, "m.read.private"));
    expect(sendReadReceipt).toHaveBeenCalledTimes(1);
    for (const call of sendReadReceipt.mock.calls) expect(call[1]).not.toBe("m.read");
  });
});

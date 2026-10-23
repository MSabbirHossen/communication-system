import { describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { EventStatus, type MatrixClient, type MatrixEvent, type Room } from "matrix-js-sdk";
import {
  EncryptionRequiredError,
  canSendEncrypted,
  discardFailed,
  hasOlderHistory,
  loadOlder,
  markReadPrivately,
  retrySend,
  sendText,
  statusOf,
  subscribeRoom,
  timelineItems,
  toItem,
} from "./timeline";

export const ME = "@alice:localhost";
export const BOB = "@bob:localhost";

export interface FakeEventSpec {
  id?: string;
  type?: string;
  sender?: string;
  ts?: number;
  content?: Record<string, unknown>;
  status?: EventStatus | null;
  decryptionFailure?: string | null; // DecryptionFailureCode string, or null for "failed, unknown reason"
  roomId?: string;
}

let counter = 0;

/** A mutable stand-in for MatrixEvent: tests change `status` and emit SDK events themselves. */
export function fakeEvent(spec: FakeEventSpec = {}) {
  const ev = {
    id: spec.id ?? `$e${++counter}`,
    type: spec.type ?? "m.room.message",
    sender: spec.sender ?? BOB,
    ts: spec.ts ?? 1_700_000_000_000 + counter * 1000,
    content: spec.content ?? { msgtype: "m.text", body: `message ${counter}` },
    status: spec.status === undefined ? null : spec.status,
    failed: spec.decryptionFailure !== undefined,
    reason: spec.decryptionFailure ?? null,
    roomId: spec.roomId ?? "!room:localhost",
    getId() {
      return this.id;
    },
    getType() {
      return this.type;
    },
    getSender() {
      return this.sender;
    },
    getTs() {
      return this.ts;
    },
    getContent() {
      return this.content;
    },
    getRoomId() {
      return this.roomId;
    },
    isDecryptionFailure() {
      return this.failed;
    },
    get decryptionFailureReason() {
      return this.reason;
    },
  };
  return ev as unknown as MatrixEvent & typeof ev;
}

export function fakeTimelineRoom(
  roomId: string,
  events: MatrixEvent[],
  encrypted = true,
  backToken: string | null = null,
) {
  const room = {
    roomId,
    events,
    backToken,
    hasEncryptionStateEvent: () => encrypted,
    getLiveTimeline: () => ({
      getEvents: () => room.events,
      getPaginationToken: () => room.backToken,
    }),
    findEventById: (id: string) => room.events.find((e) => e.getId() === id),
  };
  return room as unknown as Room & typeof room;
}

export function fakeTimelineClient(
  rooms: Room[],
  opts: { encryptionEnabled?: boolean; crypto?: boolean } = {},
) {
  const em = new EventEmitter();
  const crypto = {
    isEncryptionEnabledInRoom: vi.fn(async () => opts.encryptionEnabled ?? true),
  };
  const sendTextMessage = vi.fn(async () => ({ event_id: "$sent" }));
  const resendEvent = vi.fn(async () => ({ event_id: "$resent" }));
  const cancelPendingEvent = vi.fn();
  const scrollback = vi.fn(async (room: Room) => room);
  const sendReadReceipt = vi.fn(async (_ev: MatrixEvent, _type?: string) => ({}));
  const client = {
    getUserId: () => ME,
    getCrypto: () => (opts.crypto === false ? undefined : crypto),
    scrollback,
    sendReadReceipt,
    getRoom: (id: string) => rooms.find((r) => r.roomId === id) ?? null,
    on: (e: string, cb: (...a: unknown[]) => void) => em.on(e, cb),
    removeListener: (e: string, cb: (...a: unknown[]) => void) => em.removeListener(e, cb),
    sendTextMessage,
    resendEvent,
    cancelPendingEvent,
  } as unknown as MatrixClient;
  return {
    client,
    em,
    crypto,
    sendTextMessage,
    resendEvent,
    cancelPendingEvent,
    scrollback,
    sendReadReceipt,
  };
}

describe("message status", () => {
  it("maps every SDK send state honestly", () => {
    expect(statusOf(fakeEvent({ status: EventStatus.ENCRYPTING }))).toBe("pending");
    expect(statusOf(fakeEvent({ status: EventStatus.QUEUED }))).toBe("pending");
    expect(statusOf(fakeEvent({ status: EventStatus.SENDING }))).toBe("pending");
    expect(statusOf(fakeEvent({ status: EventStatus.NOT_SENT }))).toBe("failed");
    expect(statusOf(fakeEvent({ status: EventStatus.CANCELLED }))).toBe("failed");
    expect(statusOf(fakeEvent({ status: EventStatus.SENT }))).toBe("sent");
    expect(statusOf(fakeEvent({ status: null }))).toBe("sent");
  });
});

describe("timeline items", () => {
  it("maps text, undecryptable, unsupported and system events, hiding the rest", () => {
    const events = [
      fakeEvent({ id: "$1", sender: BOB, content: { msgtype: "m.text", body: "hello" } }),
      fakeEvent({
        id: "$2",
        sender: ME,
        status: EventStatus.SENDING,
        content: { msgtype: "m.text", body: "hi" },
      }),
      fakeEvent({
        id: "$3",
        type: "m.room.encrypted",
        decryptionFailure: "MEGOLM_UNKNOWN_INBOUND_SESSION_ID",
      }),
      fakeEvent({ id: "$4", type: "m.room.encrypted", decryptionFailure: null }),
      fakeEvent({ id: "$5", content: { msgtype: "m.image", body: "cat.png" } }),
      fakeEvent({
        id: "$6",
        type: "m.room.encryption",
        content: { algorithm: "m.megolm.v1.aes-sha2" },
      }),
      fakeEvent({ id: "$7", type: "m.room.member", content: { membership: "join" } }),
      fakeEvent({ id: "$8", type: "m.room.power_levels", content: {} }),
    ];
    const items = timelineItems(fakeTimelineRoom("!r", events), ME);
    expect(items.map((i) => i.kind)).toEqual([
      "text",
      "text",
      "undecryptable",
      "undecryptable",
      "unsupported",
      "system",
      "system",
    ]);
    expect(items[0]).toMatchObject({ body: "hello", mine: false, status: "sent", eventId: "$1" });
    expect(items[1]).toMatchObject({ body: "hi", mine: true, status: "pending" });
    expect(items[2]).toMatchObject({ code: "MEGOLM_UNKNOWN_INBOUND_SESSION_ID" });
    expect(items[3]).toMatchObject({ code: "unknown" });
    expect(items[4]).toMatchObject({ eventType: "m.image" });
    expect(items[5]).toMatchObject({ text: "encryption_enabled" });
    expect(items[6]).toMatchObject({ text: "joined" });
    expect(
      toItem(fakeEvent({ type: "m.room.member", content: { membership: "ban" } }), ME),
    ).toBeNull();
  });
});

describe("subscribeRoom", () => {
  it("notifies for this room only and detaches on unsubscribe", () => {
    const room = fakeTimelineRoom("!r", []);
    const other = fakeTimelineRoom("!other", []);
    const { client, em } = fakeTimelineClient([room, other]);
    const cb = vi.fn();
    const stop = subscribeRoom(client, room, cb);
    em.emit("Room.timeline", fakeEvent(), room, false, false, {});
    em.emit("Room.timeline", fakeEvent(), other, false, false, {});
    em.emit("Room.localEchoUpdated", fakeEvent(), room);
    em.emit("Event.decrypted", fakeEvent({ roomId: "!r" }));
    em.emit("Event.decrypted", fakeEvent({ roomId: "!other" }));
    expect(cb).toHaveBeenCalledTimes(3);
    stop();
    em.emit("Room.timeline", fakeEvent(), room, false, false, {});
    expect(cb).toHaveBeenCalledTimes(3);
    expect(em.eventNames()).toEqual([]);
  });
});

describe("sending", () => {
  it("sends the trimmed text through the SDK when the room is encrypted", async () => {
    const room = fakeTimelineRoom("!r", []);
    const { client, sendTextMessage, crypto } = fakeTimelineClient([room]);
    await sendText(client, "!r", "  hello there \n");
    expect(crypto.isEncryptionEnabledInRoom).toHaveBeenCalledWith("!r");
    expect(sendTextMessage).toHaveBeenCalledWith("!r", "hello there");
    await sendText(client, "!r", "   ");
    expect(sendTextMessage).toHaveBeenCalledTimes(1);
  });

  it("refuses to send when the room has no encryption state, when the backend says no, or without crypto", async () => {
    const plain = fakeTimelineRoom("!plain", [], false);
    const enc = fakeTimelineRoom("!enc", []);
    const a = fakeTimelineClient([plain, enc]);
    await expect(sendText(a.client, "!plain", "x")).rejects.toBeInstanceOf(EncryptionRequiredError);
    const b = fakeTimelineClient([enc], { encryptionEnabled: false });
    await expect(sendText(b.client, "!enc", "x")).rejects.toBeInstanceOf(EncryptionRequiredError);
    const c = fakeTimelineClient([enc], { crypto: false });
    await expect(sendText(c.client, "!enc", "x")).rejects.toBeInstanceOf(EncryptionRequiredError);
    expect(a.sendTextMessage).not.toHaveBeenCalled();
    expect(b.sendTextMessage).not.toHaveBeenCalled();
    expect(c.sendTextMessage).not.toHaveBeenCalled();
    expect(await canSendEncrypted(a.client, "!missing")).toBe(false);
  });

  it("retries with the same event and discards through the SDK", async () => {
    const room = fakeTimelineRoom("!r", []);
    const { client, resendEvent, cancelPendingEvent } = fakeTimelineClient([room]);
    const ev = fakeEvent({ status: EventStatus.NOT_SENT });
    await retrySend(client, room, ev);
    expect(resendEvent).toHaveBeenCalledWith(ev, room);
    discardFailed(client, ev);
    expect(cancelPendingEvent).toHaveBeenCalledWith(ev);
  });
});

describe("history and receipts", () => {
  it("reports older history from the back-pagination token and loads it through scrollback", async () => {
    const more = fakeTimelineRoom("!r", [], true, "t1");
    const { client, scrollback } = fakeTimelineClient([more]);
    expect(hasOlderHistory(more)).toBe(true);
    more.backToken = null;
    expect(await loadOlder(client, more)).toBe(false);
    expect(scrollback).toHaveBeenCalledWith(more, 30);
    await loadOlder(client, more, 50);
    expect(scrollback).toHaveBeenLastCalledWith(more, 50);
  });

  it("sends one private receipt for the latest accepted event, never a public one", async () => {
    const sent = fakeEvent({ id: "$sent" });
    const pending = fakeEvent({ id: "~pending", sender: ME, status: EventStatus.SENDING });
    const room = fakeTimelineRoom("!rr", [fakeEvent({ id: "$old" }), sent, pending]);
    const { client, sendReadReceipt } = fakeTimelineClient([room]);
    await markReadPrivately(client, room);
    expect(sendReadReceipt).toHaveBeenCalledWith(sent, "m.read.private");
    await markReadPrivately(client, room);
    expect(sendReadReceipt).toHaveBeenCalledTimes(1);
    const newer = fakeEvent({ id: "$newer" });
    room.events.push(newer);
    await markReadPrivately(client, room);
    expect(sendReadReceipt).toHaveBeenLastCalledWith(newer, "m.read.private");
    for (const call of sendReadReceipt.mock.calls) expect(call[1]).not.toBe("m.read");
  });

  it("does nothing when only pending events exist", async () => {
    const room = fakeTimelineRoom("!p", [fakeEvent({ id: "~x", status: EventStatus.QUEUED })]);
    const { client, sendReadReceipt } = fakeTimelineClient([room]);
    await markReadPrivately(client, room);
    expect(sendReadReceipt).not.toHaveBeenCalled();
  });
});

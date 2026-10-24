import { describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { MatrixClient } from "../matrix/client";
import {
  notificationPermission,
  notificationText,
  requestNotificationPermission,
  watchNewMessages,
  type NotificationApi,
} from "./notifications";

const ME = "@me:localhost";
const BOB = "@bob:localhost";
const ROOM = "!r:localhost";

function fakeRoom(membership = "join") {
  return {
    roomId: ROOM,
    getMyMembership: () => membership,
    getDMInviter: () => BOB,
    getMember: (id: string) => (id === BOB ? { name: "Bob", userId: BOB } : null),
    getMembers: () => [],
  };
}

function fakeEvent(o: {
  id: string;
  sender?: string;
  type?: string;
  msgtype?: string;
  body?: string;
  beingDecrypted?: boolean;
  failed?: boolean;
}) {
  return {
    getId: () => o.id,
    getSender: () => o.sender ?? BOB,
    getType: () => o.type ?? "m.room.message",
    getContent: () => ({ msgtype: o.msgtype ?? "m.text", body: o.body ?? "secret body" }),
    getRoomId: () => ROOM,
    isBeingDecrypted: () => o.beingDecrypted ?? false,
    isDecryptionFailure: () => o.failed ?? false,
  };
}

function harness(
  opts: { hidden?: boolean; preview?: "off" | "generic" | "sender"; sync?: string } = {},
) {
  const em = new EventEmitter();
  const room = fakeRoom();
  const client = {
    getUserId: () => ME,
    getRoom: (id: string) => (id === ROOM ? room : null),
    getAccountData: () => undefined,
    getSyncState: () => opts.sync ?? "SYNCING",
    on: (e: string, cb: (...a: unknown[]) => void) => em.on(e, cb),
    removeListener: (e: string, cb: (...a: unknown[]) => void) => em.removeListener(e, cb),
  } as unknown as MatrixClient;
  const show = vi.fn();
  const stop = watchNewMessages(client, {
    preview: () => opts.preview ?? "generic",
    hidden: () => opts.hidden ?? true,
    show,
  });
  const live = (ev: unknown, extra: Partial<{ toStart: boolean; liveEvent: boolean }> = {}) =>
    em.emit("Room.timeline", ev, room, extra.toStart ?? false, false, {
      liveEvent: extra.liveEvent ?? true,
    });
  const decrypted = (ev: unknown) => em.emit("Event.decrypted", ev);
  return { em, room, show, stop, live, decrypted };
}

describe("notification text", () => {
  it("never includes the message body", () => {
    expect(notificationText("off", "Bob")).toBeNull();
    expect(notificationText("generic", "Bob")).toBe("New message");
    expect(notificationText("sender", "Bob")).toBe("New message from Bob");
  });
});

describe("watching new messages", () => {
  it("shows a generic notification for a live incoming text while hidden, once per event", () => {
    const h = harness();
    const ev = fakeEvent({ id: "$1", body: "the secret" });
    h.live(ev);
    h.live(ev);
    expect(h.show).toHaveBeenCalledTimes(1);
    expect(h.show).toHaveBeenCalledWith("New message", ROOM);
    expect(JSON.stringify(h.show.mock.calls)).not.toContain("the secret");
  });

  it("uses the sender's display name only when the setting says so", () => {
    const h = harness({ preview: "sender" });
    h.live(fakeEvent({ id: "$1" }));
    expect(h.show).toHaveBeenCalledWith("New message from Bob", ROOM);
  });

  it("stays silent when off, when the tab is visible, for own messages and for non-text", () => {
    harness({ preview: "off" }).live(fakeEvent({ id: "$1" }));
    harness({ hidden: false }).live(fakeEvent({ id: "$2" }));
    const own = harness();
    own.live(fakeEvent({ id: "$3", sender: ME }));
    const other = harness();
    other.live(fakeEvent({ id: "$4", msgtype: "m.image" }));
    other.live(fakeEvent({ id: "$5", type: "m.room.member" }));
    expect(own.show).not.toHaveBeenCalled();
    expect(other.show).not.toHaveBeenCalled();
  });

  it("ignores back-pagination, non-live events and events outside an active sync", () => {
    const h = harness();
    h.live(fakeEvent({ id: "$1" }), { toStart: true });
    h.live(fakeEvent({ id: "$2" }), { liveEvent: false });
    harness({ sync: "PREPARED" }).live(fakeEvent({ id: "$3" }));
    expect(h.show).not.toHaveBeenCalled();
  });

  it("waits for decryption of an encrypted live event and notifies once it is text", () => {
    const h = harness();
    const ev = fakeEvent({ id: "$e", type: "m.room.encrypted", beingDecrypted: true });
    h.live(ev);
    expect(h.show).not.toHaveBeenCalled();
    h.decrypted(fakeEvent({ id: "$e" }));
    expect(h.show).toHaveBeenCalledTimes(1);
    // A decrypted event that never came through the live timeline (back-pagination) is ignored.
    h.decrypted(fakeEvent({ id: "$old" }));
    expect(h.show).toHaveBeenCalledTimes(1);
  });

  it("stops listening when released", () => {
    const h = harness();
    h.stop();
    h.live(fakeEvent({ id: "$1" }));
    expect(h.show).not.toHaveBeenCalled();
    expect(h.em.eventNames()).toEqual([]);
  });
});

describe("browser permission", () => {
  it("reports unsupported without the API and asks the browser otherwise", async () => {
    expect(notificationPermission(null)).toBe("unsupported");
    expect(await requestNotificationPermission(null)).toBe("unsupported");
    const requestPermission = vi.fn(async () => "granted" as const);
    const api = { permission: "default", requestPermission } as unknown as NotificationApi;
    expect(notificationPermission(api)).toBe("default");
    expect(await requestNotificationPermission(api)).toBe("granted");
    const failing = {
      permission: "denied",
      requestPermission: vi.fn(async () => {
        throw new Error("no");
      }),
    } as unknown as NotificationApi;
    expect(await requestNotificationPermission(failing)).toBe("denied");
  });
});

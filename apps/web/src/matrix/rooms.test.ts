import { describe, expect, it, vi } from "vitest";
import type { MatrixClient, Room } from "matrix-js-sdk";
import {
  acceptInvite,
  createDirectRoom,
  declineInvite,
  findDirectRoom,
  isDirectRoom,
  listDirectConversations,
  lookupUser,
  otherUserOf,
  recordDirectRoom,
  resolveUserId,
} from "./rooms";

export const ME = "@alice:localhost";
export const BOB = "@bob:localhost";

export interface FakeEvent {
  type: string;
  sender: string;
  body?: string;
  decryptionFailure?: boolean;
}

export interface FakeRoomSpec {
  roomId: string;
  myMembership?: "join" | "invite" | "leave";
  members?: Array<{ userId: string; name?: string; membership?: "join" | "invite" | "leave" }>;
  dmInviter?: string;
  isDirectOnMyMembership?: boolean;
  lastActiveTs?: number;
  unread?: number;
  encrypted?: boolean;
  events?: FakeEvent[];
}

/** A plain-object stand-in for the SDK Room with the accessors the model reads. */
export function fakeRoom(spec: FakeRoomSpec): Room {
  const members = spec.members ?? [
    { userId: ME, membership: "join" },
    { userId: BOB, name: "Bob", membership: "join" },
  ];
  const events = (spec.events ?? []).map((e) => ({
    getType: () => e.type,
    getSender: () => e.sender,
    getContent: () => (e.body !== undefined ? { msgtype: "m.text", body: e.body } : {}),
    isDecryptionFailure: () => e.decryptionFailure === true,
  }));
  return {
    roomId: spec.roomId,
    getMyMembership: () => spec.myMembership ?? "join",
    getMembers: () =>
      members.map((m) => ({
        userId: m.userId,
        name: m.name ?? m.userId,
        membership: m.membership ?? "join",
      })),
    getMember: (userId: string) => {
      const m = members.find((x) => x.userId === userId);
      if (!m) return null;
      return {
        userId,
        name: m.name ?? userId,
        membership: m.membership ?? "join",
        events: {
          member:
            userId === ME && spec.isDirectOnMyMembership
              ? { getContent: () => ({ membership: "join", is_direct: true }) }
              : undefined,
        },
      };
    },
    getDMInviter: () => spec.dmInviter,
    getLastActiveTimestamp: () => spec.lastActiveTs ?? 0,
    getUnreadNotificationCount: () => spec.unread ?? 0,
    hasEncryptionStateEvent: () => spec.encrypted ?? true,
    getLiveTimeline: () => ({ getEvents: () => events, getPaginationToken: () => null }),
  } as unknown as Room;
}

export function fakeRoomClient(rooms: Room[], direct: Record<string, string[]> = {}) {
  const accountData = { direct };
  const setAccountData = vi.fn(async (_type: string, content: Record<string, string[]>) => {
    accountData.direct = content;
    return {};
  });
  const joinRoom = vi.fn(async () => ({}));
  const leave = vi.fn(async () => ({}));
  const client = {
    getUserId: () => ME,
    getVisibleRooms: () => rooms,
    getRoom: (id: string) => rooms.find((r) => r.roomId === id) ?? null,
    getAccountData: (type: string) =>
      type === "m.direct" ? { getContent: () => accountData.direct } : undefined,
    setAccountData,
    joinRoom,
    leave,
  } as unknown as MatrixClient;
  return { client, setAccountData, joinRoom, leave, accountData };
}

describe("direct conversation model", () => {
  it("lists direct rooms from m.direct, invites and is_direct membership, newest first", () => {
    const rooms = [
      fakeRoom({
        roomId: "!a",
        lastActiveTs: 100,
        events: [{ type: "m.room.message", sender: BOB, body: "hi" }],
      }),
      fakeRoom({
        roomId: "!b",
        myMembership: "invite",
        dmInviter: "@carol:localhost",
        members: [
          { userId: ME, membership: "invite" },
          { userId: "@carol:localhost", name: "Carol" },
        ],
        lastActiveTs: 300,
      }),
      fakeRoom({ roomId: "!c", isDirectOnMyMembership: true, lastActiveTs: 200, unread: 3 }),
      fakeRoom({
        roomId: "!group",
        lastActiveTs: 400,
        members: [{ userId: ME }, { userId: BOB }, { userId: "@dave:localhost" }],
      }),
      fakeRoom({ roomId: "!left", myMembership: "leave", lastActiveTs: 500 }),
    ];
    const { client } = fakeRoomClient(rooms, { [BOB]: ["!a"] });
    const list = listDirectConversations(client);
    expect(list.map((c) => c.roomId)).toEqual(["!b", "!c", "!a"]);
    expect(list[0]).toMatchObject({
      membership: "invite",
      otherUserId: "@carol:localhost",
      displayName: "Carol",
      preview: { kind: "none" },
    });
    expect(list[1]).toMatchObject({ otherUserId: BOB, unreadCount: 3, encrypted: true });
    expect(list[2]).toMatchObject({
      displayName: "Bob",
      preview: { kind: "text", body: "hi", mine: false },
    });
  });

  it("previews the latest text message, marks own messages, and reports undecryptable ones", () => {
    const mine = fakeRoom({
      roomId: "!m",
      events: [
        { type: "m.room.message", sender: BOB, body: "first" },
        { type: "m.room.member", sender: BOB },
        { type: "m.room.message", sender: ME, body: "last" },
      ],
    });
    const enc = fakeRoom({
      roomId: "!e",
      events: [
        { type: "m.room.message", sender: BOB, body: "old" },
        { type: "m.room.encrypted", sender: BOB, decryptionFailure: true },
      ],
    });
    const { client } = fakeRoomClient([mine, enc], { [BOB]: ["!m", "!e"] });
    const byId = Object.fromEntries(listDirectConversations(client).map((c) => [c.roomId, c]));
    expect(byId["!m"]!.preview).toEqual({ kind: "text", body: "last", mine: true });
    expect(byId["!e"]!.preview).toEqual({ kind: "encrypted" });
  });

  it("identifies the other participant from m.direct, the inviter, or the sole other member", () => {
    const room = fakeRoom({ roomId: "!x" });
    expect(otherUserOf(room, ME, { "@someone:localhost": ["!x"] })).toBe("@someone:localhost");
    expect(otherUserOf(fakeRoom({ roomId: "!y", dmInviter: BOB }), ME, {})).toBe(BOB);
    expect(otherUserOf(room, ME, {})).toBe(BOB);
    const three = fakeRoom({
      roomId: "!z",
      members: [{ userId: ME }, { userId: BOB }, { userId: "@d:localhost" }],
    });
    expect(otherUserOf(three, ME, {})).toBeUndefined();
    expect(isDirectRoom(three, ME, {})).toBe(false);
  });

  it("records a room under the other user idempotently", async () => {
    const { client, setAccountData } = fakeRoomClient([], { [BOB]: ["!old"] });
    await recordDirectRoom(client, BOB, "!new");
    expect(setAccountData).toHaveBeenCalledWith("m.direct", { [BOB]: ["!old", "!new"] });
    await recordDirectRoom(client, BOB, "!new");
    expect(setAccountData).toHaveBeenCalledTimes(1);
    await recordDirectRoom(client, "@carol:localhost", "!c");
    expect(setAccountData).toHaveBeenLastCalledWith("m.direct", {
      [BOB]: ["!old", "!new"],
      "@carol:localhost": ["!c"],
    });
  });

  it("accepting an invite joins and records the inviter; declining leaves", async () => {
    const invite = fakeRoom({
      roomId: "!inv",
      myMembership: "invite",
      dmInviter: BOB,
      members: [{ userId: ME, membership: "invite" }, { userId: BOB }],
    });
    const { client, joinRoom, leave, setAccountData } = fakeRoomClient([invite]);
    await acceptInvite(client, "!inv");
    expect(joinRoom).toHaveBeenCalledWith("!inv");
    expect(setAccountData).toHaveBeenCalledWith("m.direct", { [BOB]: ["!inv"] });
    await declineInvite(client, "!inv");
    expect(leave).toHaveBeenCalledWith("!inv");
  });
});

describe("starting a conversation by identifier", () => {
  it("resolves local usernames and full ids, rejecting bad input and the user's own id", () => {
    expect(resolveUserId("bob", "localhost", ME)).toEqual({ ok: true, userId: BOB });
    expect(resolveUserId("  @bob:localhost ", "localhost", ME)).toEqual({ ok: true, userId: BOB });
    expect(resolveUserId("@bob:example.org:8448", "localhost", ME)).toEqual({
      ok: true,
      userId: "@bob:example.org:8448",
    });
    expect(resolveUserId("", "localhost", ME)).toEqual({ ok: false, reason: "empty" });
    expect(resolveUserId("Bob", "localhost", ME)).toEqual({ ok: false, reason: "invalid" });
    expect(resolveUserId("bob smith", "localhost", ME)).toEqual({ ok: false, reason: "invalid" });
    expect(resolveUserId("@bob", "localhost", ME)).toEqual({ ok: false, reason: "invalid" });
    expect(resolveUserId("alice", "localhost", ME)).toEqual({ ok: false, reason: "self" });
  });

  it("looks up a profile, treating M_NOT_FOUND as unknown and passing other errors through", async () => {
    const getProfileInfo = vi.fn(async (userId: string) => {
      if (userId === BOB) return { displayname: "  Bob  " };
      if (userId === "@blank:localhost") return {};
      if (userId === "@down:localhost") throw new Error("boom");
      if (userId === "@gone:localhost")
        throw Object.assign(new Error("No row found"), { errcode: "M_UNKNOWN", httpStatus: 404 });
      throw Object.assign(new Error("not found"), { errcode: "M_NOT_FOUND" });
    });
    const client = { getProfileInfo } as unknown as MatrixClient;
    expect(await lookupUser(client, BOB)).toEqual({ found: true, userId: BOB, displayName: "Bob" });
    expect(await lookupUser(client, "@blank:localhost")).toEqual({
      found: true,
      userId: "@blank:localhost",
      displayName: "@blank:localhost",
    });
    expect(await lookupUser(client, "@nobody:localhost")).toEqual({
      found: false,
      userId: "@nobody:localhost",
    });
    expect(await lookupUser(client, "@gone:localhost")).toEqual({
      found: false,
      userId: "@gone:localhost",
    });
    await expect(lookupUser(client, "@down:localhost")).rejects.toThrow("boom");
  });

  it("finds an existing direct room, preferring joined rooms over invitations", () => {
    const joined = fakeRoom({ roomId: "!j", lastActiveTs: 1 });
    const invite = fakeRoom({
      roomId: "!i",
      myMembership: "invite",
      dmInviter: BOB,
      members: [{ userId: ME, membership: "invite" }, { userId: BOB }],
      lastActiveTs: 9,
    });
    expect(
      findDirectRoom(fakeRoomClient([invite, joined], { [BOB]: ["!j"] }).client, BOB)?.roomId,
    ).toBe("!j");
    expect(findDirectRoom(fakeRoomClient([invite]).client, BOB)?.roomId).toBe("!i");
    expect(findDirectRoom(fakeRoomClient([]).client, BOB)).toBeNull();
  });

  it("creates an invite-only encrypted room and records it", async () => {
    const { client, setAccountData } = fakeRoomClient([]);
    const createRoom = vi.fn(async () => ({ room_id: "!new" }));
    (client as unknown as { createRoom: typeof createRoom }).createRoom = createRoom;
    expect(await createDirectRoom(client, BOB)).toBe("!new");
    expect(createRoom).toHaveBeenCalledWith({
      is_direct: true,
      invite: [BOB],
      preset: "trusted_private_chat",
      initial_state: [
        {
          type: "m.room.encryption",
          state_key: "",
          content: { algorithm: "m.megolm.v1.aes-sha2" },
        },
      ],
    });
    expect(setAccountData).toHaveBeenCalledWith("m.direct", { [BOB]: ["!new"] });
  });
});

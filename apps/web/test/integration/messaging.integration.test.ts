import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect, it } from "vitest";
import { EventType, MsgType, type MatrixClient, type Room } from "matrix-js-sdk";
import { restartSync } from "../../src/matrix/client";
import { ensureCryptoReady } from "../../src/matrix/cryptoSetup";
import { getRecipientSecurity } from "../../src/matrix/recipientSecurity";
import { SecretStorageKeyHolder } from "../../src/matrix/recoveryKey";
import {
  acceptInvite,
  createDirectRoom,
  directRoomsMap,
  findDirectRoom,
  listDirectConversations,
  lookupUser,
  resolveUserId,
} from "../../src/matrix/rooms";
import {
  EncryptionRequiredError,
  hasOlderHistory,
  loadOlder,
  markReadPrivately,
  sendText,
  timelineItems,
  type MessageItem,
} from "../../src/matrix/timeline";
import {
  HOMESERVER_URL,
  describeIntegration,
  deviceClient,
  loginAgain,
  newAccount,
  stopClients,
  waitFor,
  type Account,
} from "./helpers";

const here = dirname(fileURLToPath(import.meta.url));
/** Nonce the CI inspector looks for in the server database and log (must never appear). */
const NONCE = `IT-PLAINTEXT-${randomBytes(8).toString("hex")}`;

function textItems(room: Room, me: string) {
  return timelineItems(room, me).filter(
    (i): i is Extract<MessageItem, { kind: "text" }> => i.kind === "text",
  );
}

async function firstDevice(acct: Account): Promise<MatrixClient> {
  const client = await deviceClient(acct.session, new SecretStorageKeyHolder());
  const outcome = await ensureCryptoReady(client, new SecretStorageKeyHolder(), {
    requestPassword: async () => acct.password,
    requestRecoveryKey: async () => null,
    showRecoveryKey: async () => {},
  });
  expect(outcome.outcome).toBe("created");
  return client;
}

describeIntegration("one-to-one encrypted messaging", () => {
  let alice: Account;
  let bob: Account;
  let a: MatrixClient;
  let b: MatrixClient;
  let roomId: string;
  let roomA: Room;
  let roomB: Room;
  let firstEventId: string;

  beforeAll(async () => {
    [alice, bob] = await Promise.all([newAccount("alice"), newAccount("bob")]);
    [a, b] = await Promise.all([firstDevice(alice), firstDevice(bob)]);
  }, 120_000);
  afterAll(stopClients);

  it("starts a conversation by identifier; the invitation is accepted and recorded on both sides", async () => {
    const resolved = resolveUserId(
      bob.username,
      a.getDomain() ?? "localhost",
      alice.session.userId,
    );
    expect(resolved).toEqual({ ok: true, userId: bob.session.userId });
    const lookup = await lookupUser(a, bob.session.userId);
    expect(lookup).toMatchObject({ found: true, userId: bob.session.userId });
    expect(await lookupUser(a, `@nobody-${Date.now()}:localhost`)).toMatchObject({ found: false });

    roomId = await createDirectRoom(a, bob.session.userId);
    expect(directRoomsMap(a)[bob.session.userId]).toContain(roomId);
    roomA = await waitFor("Alice's room", () => a.getRoom(roomId));
    expect(roomA.hasEncryptionStateEvent()).toBe(true);

    const invite = await waitFor("Bob's invitation", () =>
      listDirectConversations(b).find((c) => c.roomId === roomId && c.membership === "invite"),
    );
    expect(invite.otherUserId).toBe(alice.session.userId);
    await acceptInvite(b, roomId);
    roomB = await waitFor("Bob joined", () => {
      const r = b.getRoom(roomId);
      return r?.getMyMembership() === "join" ? r : null;
    });
    await waitFor("m.direct on Bob", () =>
      directRoomsMap(b)[alice.session.userId]?.includes(roomId),
    );
    expect(findDirectRoom(a, bob.session.userId)?.roomId).toBe(roomId);
    expect(findDirectRoom(b, alice.session.userId)?.roomId).toBe(roomId);
    await waitFor(
      "Alice sees Bob joined",
      () => listDirectConversations(a).find((c) => c.roomId === roomId)?.membership === "join",
    );
  });

  it("exchanges an encrypted message that the recipient decrypts while the server holds ciphertext", async () => {
    await sendText(a, roomId, `hello bob ${NONCE}`);
    const received = await waitFor("Bob decrypts", () =>
      textItems(roomB, bob.session.userId).find((i) => i.body.includes(NONCE)),
    );
    expect(received.mine).toBe(false);
    expect(received.status).toBe("sent");
    firstEventId = received.eventId!;

    const mine = await waitFor("Alice's echo accepted", () =>
      textItems(roomA, alice.session.userId).find(
        (i) => i.eventId === firstEventId && i.status === "sent",
      ),
    );
    expect(mine.mine).toBe(true);

    // What the server returns is what it stores: an encrypted event with no body.
    const raw = await a.fetchRoomEvent(roomId, firstEventId);
    expect(raw.type).toBe("m.room.encrypted");
    expect((raw.content as { body?: unknown }).body).toBeUndefined();
    expect(JSON.stringify(raw)).not.toContain(NONCE);

    writeFileSync(
      join(here, "last-run.json"),
      JSON.stringify({ roomId, nonce: NONCE, forbiddenPlaintexts: [NONCE] }, null, 2),
    );

    // Bob replies; Alice decrypts.
    await sendText(b, roomId, `hi alice ${NONCE}-reply`);
    await waitFor("Alice decrypts the reply", () =>
      textItems(roomA, alice.session.userId).find((i) => i.body.endsWith("-reply") && !i.mine),
    );
  });

  it("warns about the recipient's unverified devices; a device enrolled later cannot read earlier messages", async () => {
    const security = await getRecipientSecurity(a, bob.session.userId);
    expect(security.identity).toBe("unverified");
    expect(security.unverifiedCount).toBeGreaterThanOrEqual(1);

    const bob2Session = await loginAgain(bob, "Bob's second device");
    const b2 = await deviceClient(bob2Session, new SecretStorageKeyHolder());
    const roomB2 = await waitFor("Bob2's room", () => b2.getRoom(roomId));
    const late = await waitFor("Bob2 sees the earlier event", () =>
      timelineItems(roomB2, bob.session.userId).find((i) => i.eventId === firstEventId),
    );
    expect(late.kind).toBe("undecryptable");
    expect(String((late as { code: string }).code)).toMatch(/HISTORICAL|UNKNOWN_INBOUND_SESSION/);

    // Alice learns about the new device and includes it from now on.
    await waitFor(
      "Alice sees two Bob devices",
      async () => (await getRecipientSecurity(a, bob.session.userId)).devices.length >= 2,
    );
    await sendText(a, roomId, "after the new device");
    const fresh = await waitFor("Bob2 decrypts the new message", () =>
      textItems(roomB2, bob.session.userId).find((i) => i.body === "after the new device"),
    );
    expect(fresh.status).toBe("sent");
    b2.stopClient();
  });

  it("delivers messages sent while the recipient was offline exactly once and in order", async () => {
    // Simulate Bob losing the network: point his HTTP layer at a dead address so sync fails
    // and the SDK reports RECONNECTING, without stopping the client (which would also stop
    // the crypto backend, as a real client never does when merely offline).
    const http = (b as unknown as { http: { opts: { baseUrl: string } } }).http;
    const realBase = http.opts.baseUrl;
    http.opts.baseUrl = "http://127.0.0.1:9";
    await waitFor(
      "Bob is reconnecting",
      () => b.getSyncState() === "RECONNECTING" || b.getSyncState() === "ERROR",
    );
    await sendText(a, roomId, "offline one");
    await sendText(a, roomId, "offline two");
    await waitFor(
      "both accepted",
      () =>
        textItems(roomA, alice.session.userId).filter(
          (i) => i.body.startsWith("offline") && i.status === "sent",
        ).length === 2,
    );
    expect(textItems(roomB, bob.session.userId).some((i) => i.body.startsWith("offline"))).toBe(
      false,
    );
    http.opts.baseUrl = realBase;
    b.retryImmediately();
    const got = await waitFor("Bob catches up", () => {
      const items = textItems(roomB, bob.session.userId).filter((i) =>
        i.body.startsWith("offline"),
      );
      return items.length >= 2 ? items : null;
    });
    expect(got.map((i) => i.body)).toEqual(["offline one", "offline two"]);
    const ids = timelineItems(roomB, bob.session.userId).map((i) => i.eventId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("a replayed send with the same transaction id yields the same event (no duplicate)", async () => {
    const txnId = `it-txn-${randomBytes(4).toString("hex")}`;
    const first = await a.sendMessage(roomId, { msgtype: MsgType.Text, body: "replay me" }, txnId);
    const raw = await a.fetchRoomEvent(roomId, first.event_id);
    const res = await fetch(
      `${HOMESERVER_URL}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.encrypted/${encodeURIComponent(txnId)}`,
      {
        method: "PUT",
        headers: {
          authorization: `Bearer ${a.getAccessToken()}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(raw.content),
      },
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as { event_id: string }).event_id).toBe(first.event_id);
    // Sending again under the same transaction id (as a retry after a lost response would)
    // yields the same event, not a second copy.
    const again = await a.sendMessage(roomId, { msgtype: MsgType.Text, body: "replay me" }, txnId);
    expect(again.event_id).toBe(first.event_id);
    await waitFor("exactly one copy on Bob", () => {
      const copies = textItems(roomB, bob.session.userId).filter((i) => i.body === "replay me");
      return copies.length === 1 ? copies : null;
    });
  });

  it("pages older history in order without duplicates", async () => {
    for (let i = 0; i < 30; i++) await sendText(a, roomId, `page ${String(i).padStart(2, "0")}`);
    await waitFor(
      "all paged messages accepted",
      () =>
        textItems(roomA, alice.session.userId).filter(
          (i) => i.body.startsWith("page ") && i.status === "sent",
        ).length === 30,
    );
    // A fresh sync (new device, small initial window) must page backwards.
    const a2 = await deviceClient(
      await loginAgain(alice, "Alice's reader"),
      new SecretStorageKeyHolder(),
    );
    const room = await waitFor("reader's room", () => a2.getRoom(roomId));
    const before = room.getLiveTimeline().getEvents().length;
    expect(hasOlderHistory(room)).toBe(true);
    let more = true;
    let rounds = 0;
    while (more && rounds < 10) {
      more = await loadOlder(a2, room, 20);
      rounds++;
    }
    const events = room.getLiveTimeline().getEvents();
    expect(events.length).toBeGreaterThan(before);
    const ids = events.map((e) => e.getId());
    expect(new Set(ids).size).toBe(ids.length);
    for (let i = 1; i < events.length; i++)
      expect(events[i]!.getTs()).toBeGreaterThanOrEqual(events[i - 1]!.getTs());
    expect(events[0]!.getType()).toBe(EventType.RoomCreate);
    a2.stopClient();
  });

  it("marks reading privately: the reader's own devices learn it, the sender sees no receipt", async () => {
    const lastId = textItems(roomB, bob.session.userId).at(-1)!.eventId!;
    await markReadPrivately(b, roomB);
    await waitFor("Bob's unread count drops", () => roomB.getUnreadNotificationCount() === 0);
    await new Promise((r) => setTimeout(r, 2_000));
    expect(roomA.hasUserReadEvent(bob.session.userId, lastId)).toBe(false);
    expect(roomA.getReadReceiptForUserId(bob.session.userId, true)).toBeNull();
  });

  it("refuses to send into a room without encryption, before any request", async () => {
    const { room_id: plainRoom } = await a.createRoom({
      is_direct: true,
      invite: [bob.session.userId],
    });
    const room = await waitFor("plain room", () => a.getRoom(plainRoom));
    expect(room.hasEncryptionStateEvent()).toBe(false);
    await expect(sendText(a, plainRoom, `leak ${NONCE}`)).rejects.toBeInstanceOf(
      EncryptionRequiredError,
    );
    await new Promise((r) => setTimeout(r, 1_000));
    expect(
      room
        .getLiveTimeline()
        .getEvents()
        .some((e) => e.getType() === EventType.RoomMessage),
    ).toBe(false);
  });
});

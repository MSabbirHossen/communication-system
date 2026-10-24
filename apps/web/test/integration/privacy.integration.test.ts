import { afterAll, expect, it } from "vitest";
import { ensureCryptoReady } from "../../src/matrix/cryptoSetup";
import { SecretStorageKeyHolder } from "../../src/matrix/recoveryKey";
import { acceptInvite, createDirectRoom, listDirectConversations } from "../../src/matrix/rooms";
import { applyPresence, readSettings, writeSettings } from "../../src/matrix/settings";
import { markRead, readUpTo, sendText, timelineItems } from "../../src/matrix/timeline";
import {
  describeIntegration,
  deviceClient,
  newAccount,
  sleep,
  stopClients,
  waitFor,
} from "./helpers";

describeIntegration("privacy settings honoured against the homeserver", () => {
  afterAll(stopClients);

  it("public read receipts reach the sender only when sharing is on; presence follows the setting", async () => {
    const alice = await newAccount("priv-a");
    const bob = await newAccount("priv-b");
    const a = await deviceClient(alice.session, new SecretStorageKeyHolder());
    const b = await deviceClient(bob.session, new SecretStorageKeyHolder());
    for (const [client, acct] of [
      [a, alice],
      [b, bob],
    ] as const) {
      await ensureCryptoReady(client, new SecretStorageKeyHolder(), {
        requestPassword: async () => acct.password,
        requestRecoveryKey: async () => null,
        showRecoveryKey: async () => {},
      });
    }
    const roomId = await createDirectRoom(a, bob.session.userId);
    await waitFor("Bob invited", () => listDirectConversations(b).some((c) => c.roomId === roomId));
    await acceptInvite(b, roomId);
    const roomA = await waitFor("Alice's room", () => a.getRoom(roomId));
    const roomB = await waitFor("Bob joined", () => {
      const r = b.getRoom(roomId);
      return r?.getMyMembership() === "join" ? r : null;
    });

    // Settings are stored as account data and round-trip through the server.
    expect(readSettings(b).shareReadReceipts).toBe(false);
    await writeSettings(b, { shareReadReceipts: false, sharePresence: false });
    await waitFor("settings synced", () => readSettings(b).sharePresence === false);

    await sendText(a, roomId, "first");
    const first = await waitFor("Bob sees first", () =>
      timelineItems(roomB, bob.session.userId).find((i) => i.kind === "text" && i.body === "first"),
    );
    await markRead(b, roomB, { shareReadReceipts: false });
    await sleep(2_000);
    expect(readUpTo(roomA, bob.session.userId)).toBeNull();

    await writeSettings(b, { shareReadReceipts: true });
    await sendText(a, roomId, "second");
    await waitFor("Bob sees second", () =>
      timelineItems(roomB, bob.session.userId).find(
        (i) => i.kind === "text" && i.body === "second",
      ),
    );
    await markRead(b, roomB, { shareReadReceipts: true });
    const readId = await waitFor("Alice sees Bob's public receipt", () =>
      readUpTo(roomA, bob.session.userId),
    );
    expect(readId).not.toBe(first.eventId); // the receipt points at the latest event, not the first

    // Presence: sharing off reports offline to the server.
    await applyPresence(b, readSettings(b));
    await waitFor(
      "Bob reports offline",
      async () => (await a.getPresence(bob.session.userId)).presence === "offline",
      30_000,
    );
  });
});

import { afterAll, expect, it } from "vitest";
import { blockUser, listBlocked, unblockUser } from "../../src/matrix/blocking";
import { ensureCryptoReady } from "../../src/matrix/cryptoSetup";
import { SecretStorageKeyHolder } from "../../src/matrix/recoveryKey";
import { acceptInvite, createDirectRoom, listDirectConversations } from "../../src/matrix/rooms";
import { sendText, timelineItems } from "../../src/matrix/timeline";
import {
  describeIntegration,
  deviceClient,
  newAccount,
  sleep,
  stopClients,
  waitFor,
} from "./helpers";

describeIntegration("blocking through the ignore list", () => {
  afterAll(stopClients);

  it("a blocked user's messages are not delivered; unblocking restores new ones", async () => {
    const alice = await newAccount("blk-a");
    const bob = await newAccount("blk-b");
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
    await waitFor("Bob joined", () => b.getRoom(roomId)?.getMyMembership() === "join");
    const bodies = () =>
      timelineItems(roomA, alice.session.userId)
        .filter((i) => i.kind === "text" && !i.mine)
        .map((i) => (i as { body: string }).body);

    await sendText(b, roomId, "before block");
    await waitFor("Alice receives before block", () => bodies().includes("before block"));

    await blockUser(a, bob.session.userId);
    await waitFor("ignore list synced", () => listBlocked(a).includes(bob.session.userId));
    await sendText(b, roomId, "while blocked");
    await sleep(4_000);
    expect(bodies()).not.toContain("while blocked");

    await unblockUser(a, bob.session.userId);
    await waitFor("ignore list cleared", () => !listBlocked(a).includes(bob.session.userId));
    await sendText(b, roomId, "after unblock");
    await waitFor("Alice receives after unblock", () => bodies().includes("after unblock"));
    // Synapse re-syncs the room after an unignore, so the message sent while blocked
    // appears now. The client copy says so; this test does not pin that server detail.
  });
});

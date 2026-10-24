import { afterAll, expect, it } from "vitest";
import { ensureCryptoReady } from "../../src/matrix/cryptoSetup";
import { removePusher, setContentFreePusher } from "../../src/matrix/pushers";
import { SecretStorageKeyHolder } from "../../src/matrix/recoveryKey";
import { acceptInvite, createDirectRoom, listDirectConversations } from "../../src/matrix/rooms";
import { sendText } from "../../src/matrix/timeline";
import { describeIntegration, deviceClient, newAccount, stopClients, waitFor } from "./helpers";

/** Where the homeserver reaches the stub (inside the compose network) and where this test reads it. */
const GATEWAY_FROM_SERVER =
  process.env.PUSH_GATEWAY_URL ?? "http://cs-push-stub:8010/_matrix/push/v1/notify";
const STUB_FROM_HOST = process.env.PUSH_STUB_URL ?? "http://localhost:8010";

interface Recorded {
  receivedAt: string;
  notification: Record<string, unknown>;
  violations: string[];
}

async function recorded(): Promise<Recorded[]> {
  const res = await fetch(`${STUB_FROM_HOST}/notifications`);
  if (!res.ok) throw new Error(`push stub returned ${res.status}`);
  return (await res.json()) as Recorded[];
}

describeIntegration("content-free push (TM-12)", () => {
  afterAll(stopClients);

  it("the homeserver sends the gateway only identifiers for a content-free pusher", async () => {
    const health = await fetch(`${STUB_FROM_HOST}/health`).catch(() => null);
    if (!health?.ok) throw new Error(`push stub not reachable at ${STUB_FROM_HOST} (pnpm dev:env)`);

    const alice = await newAccount("push-a");
    const bob = await newAccount("push-b");
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

    const pushkey = `test-pushkey-${bob.session.deviceId}`;
    const appId = "org.communicationsystem.app.test";
    await setContentFreePusher(b, {
      appId,
      pushkey,
      gatewayUrl: GATEWAY_FROM_SERVER,
      appDisplayName: "Communication System (test)",
      deviceDisplayName: "integration device",
    });
    const pushers = await b.getPushers();
    expect(pushers.pushers.map((p) => p.pushkey)).toContain(pushkey);

    const roomId = await createDirectRoom(a, bob.session.userId);
    await waitFor("Bob invited", () => listDirectConversations(b).some((c) => c.roomId === roomId));
    await acceptInvite(b, roomId);
    await waitFor("Bob joined", () => b.getRoom(roomId)?.getMyMembership() === "join");
    await sendText(a, roomId, `push test ${pushkey} this text must never reach the gateway`);

    const hit = await waitFor(
      "gateway notified",
      async () => (await recorded()).find((r) => r.notification.room_id === roomId),
      60_000,
    );
    expect(hit.violations).toEqual([]);
    const keys = Object.keys(hit.notification).sort();
    for (const k of keys)
      expect(["counts", "devices", "event_id", "prio", "room_id", "user_is_target"]).toContain(k);
    expect(typeof hit.notification.event_id).toBe("string");
    expect(JSON.stringify(hit)).not.toContain("must never reach");
    expect(JSON.stringify(hit)).not.toContain(alice.username);
    const devices = hit.notification.devices as Array<Record<string, unknown>>;
    expect(devices[0]).toMatchObject({ app_id: appId, pushkey });

    await removePusher(b, appId, pushkey);
    const after = await b.getPushers();
    expect(after.pushers.map((p) => p.pushkey)).not.toContain(pushkey);
  });
});

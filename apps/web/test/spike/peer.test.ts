// The peer for the on-device spike (ADR-0006): the same service code as the web client,
// run in Node, invites the spike account, sends an encrypted message and waits for the
// encrypted reply. Runs only when SPIKE_PEER_USER names the spike account
// (`npx vitest run --project mobile-spike`); the mobile CI jobs feed it the id the app
// printed. Its CS_SPIKE line is collected together with the device log.
import { appendFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { ensureCryptoReady } from "../../src/matrix/cryptoSetup";
import { SecretStorageKeyHolder } from "../../src/matrix/recoveryKey";
import { createDirectRoom } from "../../src/matrix/rooms";
import { sendText, timelineItems } from "../../src/matrix/timeline";
import { deviceClient, newAccount, stopClients, waitFor } from "../integration/helpers";

const SPIKE_USER = process.env.SPIKE_PEER_USER ?? "";
const HOMESERVER = process.env.HOMESERVER_URL ?? "";

describe.skipIf(!SPIKE_USER || !HOMESERVER)("spike peer", () => {
  afterAll(stopClients);

  it("exchanges an encrypted message with the spike device", async () => {
    const peer = await newAccount("spike-peer");
    const client = await deviceClient(peer.session, new SecretStorageKeyHolder());
    await ensureCryptoReady(client, new SecretStorageKeyHolder(), {
      requestPassword: async () => peer.password,
      requestRecoveryKey: async () => null,
      showRecoveryKey: async () => {},
    });
    const roomId = await createDirectRoom(client, SPIKE_USER);
    const ping = `ping ${Date.now().toString(36)}`;
    await waitFor(
      "spike joined",
      () => {
        const room = client.getRoom(roomId);
        return room?.getMember(SPIKE_USER)?.membership === "join";
      },
      180_000,
    );
    await sendText(client, roomId, ping);
    const reply = await waitFor(
      "encrypted reply from the spike device",
      () => {
        const room = client.getRoom(roomId);
        return room
          ? timelineItems(room, peer.session.userId).find(
              (i) =>
                i.kind === "text" && !i.mine && (i as { body: string }).body === `pong ${ping}`,
            )
          : undefined;
      },
      120_000,
    );
    expect(reply).toBeTruthy();
    const line = `CS_SPIKE peer_roundtrip PASS ${SPIKE_USER} answered "${ping}"`;
    console.log(line);
    // Vitest may hide console output of passing tests; the CI scripts read this file.
    if (process.env.SPIKE_PEER_LOG)
      appendFileSync(
        process.env.SPIKE_PEER_LOG,
        `${line}
`,
      );
  });
});

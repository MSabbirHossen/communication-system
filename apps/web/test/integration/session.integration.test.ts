// The session controller against a real homeserver with persisted (fake) IndexedDB stores,
// so that a client rebuilt after a soft logout reopens the same crypto state. Runs only
// where the access-token lifetime is short enough to expire during the test (CI: 10 s).
import "fake-indexeddb/auto";
import { afterAll, expect, it } from "vitest";
import { login, logoutRemote, refreshSession, register } from "../../src/matrix/auth";
import {
  applyAccessToken,
  createMatrixClient,
  onSessionLoggedOut,
  startSync,
  stopAndClearClient,
} from "../../src/matrix/client";
import { ensureCryptoReady, getCryptoReadiness } from "../../src/matrix/cryptoSetup";
import { SecretStorageKeyHolder } from "../../src/matrix/recoveryKey";
import { createDirectRoom } from "../../src/matrix/rooms";
import type { StoredSession } from "../../src/matrix/sessionStore";
import { sendText, timelineItems } from "../../src/matrix/timeline";
import { SessionController, type SessionDeps } from "../../src/session/controller";
import {
  ACCESS_TOKEN_LIFETIME_MS,
  HOMESERVER_URL,
  describeIntegration,
  newAccount,
  sleep,
  waitFor,
} from "./helpers";

const logs: string[] = [];
const record = (level: string) => (msg: string, ctx?: unknown) =>
  logs.push(`${level} ${msg} ${ctx ? JSON.stringify(ctx) : ""}`);
const silent = {
  error: record("error"),
  warn: record("warn"),
  info: record("info"),
  debug: record("debug"),
  child: () => silent,
};

describeIntegration("session controller soft logout", () => {
  const controllers: SessionController[] = [];
  afterAll(async () => {
    for (const c of controllers) {
      const { client } = c.getSnapshot();
      client?.stopClient();
    }
  });

  it.skipIf(!ACCESS_TOKEN_LIFETIME_MS)(
    "an expired token during sync is refreshed and the client is rebuilt with its crypto state intact",
    async () => {
      const acct = await newAccount("soft");
      const bob = await newAccount("soft-peer");
      let stored: StoredSession | null = acct.session;
      const keyHolder = new SecretStorageKeyHolder();
      const controller = new SessionController({
        homeserverUrl: HOMESERVER_URL,
        logger: silent as unknown as SessionDeps["logger"],
        keyHolder,
        loadSession: async () => stored,
        saveSession: async (s) => {
          stored = s;
        },
        clearSession: async () => {
          stored = null;
        },
        login,
        register,
        refreshSession,
        logoutRemote,
        applyAccessToken,
        onSessionLoggedOut,
        createMatrixClient: (o) => createMatrixClient({ ...o, sdkLogLevel: "silent" }),
        startSync: (c) => startSync(c, { pollTimeout: 5_000, firstSyncTimeoutMs: 30_000 }),
        stopAndClearClient,
        getCryptoReadiness,
        ensureCryptoReady,
        // Ten minutes in the past: the proactive refresh is scheduled far away (and within
        // setTimeout's range), so the token expires naturally during sync.
        now: () => Date.now() - 600_000,
      });
      controllers.push(controller);

      await controller.boot();
      expect(controller.getSnapshot().status).toBe("crypto_setup");
      // Drive the setup prompts the way the screen would.
      const setup = controller.runSetup();
      for (;;) {
        const { setup: ui } = controller.getSnapshot();
        if (ui.phase === "need_password") controller.submitSetupPassword(acct.password);
        else if (ui.phase === "show_recovery_key") controller.acknowledgeRecoveryKey();
        else if (ui.phase === "done" || ui.phase === "failed") break;
        await sleep(100);
      }
      await setup;
      expect(controller.getSnapshot().status).toBe("ready");
      const first = controller.getSnapshot().client!;
      const roomId = await createDirectRoom(first, bob.session.userId);

      // Let the access token expire while sync is running. The controller's clock is pinned
      // in the past so its proactive refresh (one minute before expiry) does not fire and the
      // sync loop itself hits the expired token, which is the soft-logout path under test.
      const staleToken = acct.session.accessToken;
      await sleep(ACCESS_TOKEN_LIFETIME_MS + 2_000);
      await waitFor("client rebuilt", () => {
        const { client, status } = controller.getSnapshot();
        return client !== null && client !== first && status === "ready";
      });
      const rebuilt = controller.getSnapshot().client!;
      expect(stored?.accessToken).not.toBe(staleToken);

      // The rebuilt client reopened the same stores: identity intact, sync running,
      // and it can still encrypt into the room.
      const readiness = await getCryptoReadiness(rebuilt);
      expect(readiness.crossSigningReady).toBe(true);
      expect(["PREPARED", "SYNCING"]).toContain(rebuilt.getSyncState());
      await sendText(rebuilt, roomId, "after rebuild");
      const room = await waitFor("room on rebuilt client", () => rebuilt.getRoom(roomId));
      await waitFor("message accepted after rebuild", () =>
        timelineItems(room, acct.session.userId).some(
          (i) => i.kind === "text" && i.body === "after rebuild" && i.status === "sent",
        ),
      );
      first.stopClient();
    },
    ACCESS_TOKEN_LIFETIME_MS + 120_000,
  );
});

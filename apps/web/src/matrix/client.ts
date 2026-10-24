// The only module that constructs a MatrixClient. Everything else goes through the
// functions in this folder so the SDK boundary stays in one place (ADR-0001 C4).
import * as sdk from "matrix-js-sdk";
import type { CryptoCallbacks } from "matrix-js-sdk/lib/crypto-api/index.js";
import { logger as sdkLogger } from "matrix-js-sdk/lib/logger.js";
import type { StoredSession } from "./sessionStore";

export type { MatrixClient } from "matrix-js-sdk";
export type { CryptoCallbacks };

/** The SDK logger is a loglevel instance at runtime; its typing omits setLevel. */
const setSdkLogLevel = (level: string): void =>
  (sdkLogger as unknown as { setLevel(l: string): void }).setLevel(level);

/** IndexedDB prefix of the Rust crypto store for a device (namespaced per device). */
export function cryptoDatabasePrefix(deviceId: string): string {
  return `cs-crypto-${deviceId}`;
}

export interface TokenUpdate {
  accessToken: string;
  refreshToken?: string;
  accessTokenExpiresAt?: number;
}

export interface CreateMatrixClientOptions {
  session: StoredSession;
  /** Called with rotated tokens; the caller persists them. */
  onTokenRefresh: (tokens: TokenUpdate) => void;
  /** Secret-storage callbacks (recovery key entry) — wired by cryptoSetup. */
  cryptoCallbacks?: CryptoCallbacks;
  /** Overrides for tests. */
  indexedDB?: IDBFactory;
  /** "silent" in tests, "warn" in production, "info" in development. */
  sdkLogLevel?: "silent" | "warn" | "info" | "debug";
}

/**
 * Build a client for a persisted session with IndexedDB-backed sync and crypto stores,
 * and initialise the Rust crypto backend. Does not start syncing: call {@link startSync}.
 *
 * Stores are namespaced by device id so two sessions in one browser profile never share
 * a database (the SDK README warns that sharing corrupts data).
 */
export async function createMatrixClient(
  opts: CreateMatrixClientOptions,
): Promise<sdk.MatrixClient> {
  const { session } = opts;
  setSdkLogLevel(opts.sdkLogLevel ?? "warn");

  const idb = opts.indexedDB ?? (typeof indexedDB !== "undefined" ? indexedDB : undefined);
  const store = idb
    ? new sdk.IndexedDBStore({ indexedDB: idb, dbName: `cs-sync-${session.deviceId}` })
    : new sdk.MemoryStore();

  const client = sdk.createClient({
    baseUrl: session.homeserverUrl,
    userId: session.userId,
    deviceId: session.deviceId,
    accessToken: session.accessToken,
    // The refresh token is deliberately NOT handed to the SDK: the session controller is
    // the only refresher (proactive timer, soft-logout rebuild). Two refreshers rotating the
    // same single-use token diverge and one of them gets signed out (found under CI's 10 s
    // token lifetime, ADR-0005 D11). The SDK reports an expired token as a soft logout.
    onTokenRefresh: (t) =>
      opts.onTokenRefresh({
        accessToken: t.accessToken,
        ...(t.refreshToken ? { refreshToken: t.refreshToken } : {}),
        ...(t.expiry ? { accessTokenExpiresAt: t.expiry.getTime() } : {}),
      }),
    store,
    ...(opts.cryptoCallbacks ? { cryptoCallbacks: opts.cryptoCallbacks } : {}),
    timelineSupport: true,
    useAuthorizationHeader: true,
  });
  // The SDK requires the store to be assigned to a client before startup() is called.
  await store.startup();

  if (idb) {
    await client.initRustCrypto({ cryptoDatabasePrefix: cryptoDatabasePrefix(session.deviceId) });
  } else {
    await client.initRustCrypto({ useIndexedDB: false });
  }
  return client;
}

export interface StartSyncOptions {
  initialSyncLimit?: number;
  pollTimeout?: number;
  /** How long to wait for the first sync before continuing anyway (offline start). */
  firstSyncTimeoutMs?: number;
}

/**
 * Start syncing and wait for the first *live* sync to land (or time out), so that readiness
 * checks that depend on server state (cross-signing keys, secret-storage account data,
 * device lists) are meaningful. A client with a persisted sync store reports "prepared"
 * from its cache first; that cache can predate the account data written during setup, so
 * waiting for "prepared" alone sent an already set-up device back to the setup screen.
 * Going offline (error / reconnecting) also resolves, with whatever state is cached.
 */
export async function startSync(client: sdk.MatrixClient, o: StartSyncOptions = {}): Promise<void> {
  const firstSync = waitForFirstSync(client, o.firstSyncTimeoutMs ?? 20_000);
  await client.startClient({
    initialSyncLimit: o.initialSyncLimit ?? 20,
    pollTimeout: o.pollTimeout ?? 30_000,
  });
  await firstSync;
}

const LIVE_OR_OFFLINE = new Set<sdk.SyncState | null>([
  sdk.SyncState.Syncing,
  sdk.SyncState.Error,
  sdk.SyncState.Reconnecting,
]);

function waitForFirstSync(client: sdk.MatrixClient, timeoutMs: number): Promise<void> {
  if (LIVE_OR_OFFLINE.has(client.getSyncState())) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      client.removeListener(sdk.ClientEvent.Sync, onSync);
      resolve();
    };
    const onSync = (s: sdk.SyncState) => {
      if (LIVE_OR_OFFLINE.has(s)) done();
    };
    const timer = setTimeout(done, timeoutMs);
    client.on(sdk.ClientEvent.Sync, onSync);
  });
}

/** Stop syncing and wipe the SDK's sync and crypto stores for this device (hard logout only). */
export async function stopAndClearClient(client: sdk.MatrixClient): Promise<void> {
  client.stopClient();
  // The SDK deletes only the Rust crypto store whose prefix it is told about (its default is
  // "matrix-js-sdk"); ours is namespaced per device, so the prefix must be passed or the
  // device's keys would stay on disk after a hard logout.
  const deviceId = client.getDeviceId();
  await client.clearStores(
    deviceId ? { cryptoDatabasePrefix: cryptoDatabasePrefix(deviceId) } : {},
  );
}

/** Replace the access token the client sends (after a native /refresh). */
export function applyAccessToken(client: sdk.MatrixClient, accessToken: string): void {
  client.setAccessToken(accessToken);
}

/**
 * Subscribe to the SDK's "session logged out" signal (sync or a request got
 * M_UNKNOWN_TOKEN). `softLogout` is true when the server says the device still exists and
 * only the token is gone (expired). Returns an unsubscribe function.
 */
export function onSessionLoggedOut(
  client: sdk.MatrixClient,
  cb: (info: { softLogout: boolean }) => void,
): () => void {
  const handler = (err: sdk.MatrixError) => {
    const data = err.data as { soft_logout?: unknown } | undefined;
    cb({ softLogout: data?.soft_logout === true });
  };
  client.on(sdk.HttpApiEvent.SessionLoggedOut, handler);
  return () => client.removeListener(sdk.HttpApiEvent.SessionLoggedOut, handler);
}

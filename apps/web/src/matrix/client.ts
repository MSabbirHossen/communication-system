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
  await store.startup();

  const client = sdk.createClient({
    baseUrl: session.homeserverUrl,
    userId: session.userId,
    deviceId: session.deviceId,
    accessToken: session.accessToken,
    ...(session.refreshToken ? { refreshToken: session.refreshToken } : {}),
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

  if (idb) {
    await client.initRustCrypto({ cryptoDatabasePrefix: `cs-crypto-${session.deviceId}` });
  } else {
    await client.initRustCrypto({ useIndexedDB: false });
  }
  return client;
}

export interface StartSyncOptions {
  initialSyncLimit?: number;
  pollTimeout?: number;
}

export async function startSync(client: sdk.MatrixClient, o: StartSyncOptions = {}): Promise<void> {
  await client.startClient({
    initialSyncLimit: o.initialSyncLimit ?? 20,
    pollTimeout: o.pollTimeout ?? 30_000,
  });
}

/** Stop syncing and wipe the SDK's sync and crypto stores for this device (hard logout only). */
export async function stopAndClearClient(client: sdk.MatrixClient): Promise<void> {
  client.stopClient();
  await client.clearStores();
}

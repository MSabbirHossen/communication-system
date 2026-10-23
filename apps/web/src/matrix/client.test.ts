import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the SDK so this test asserts wiring only (no network, no wasm).
const mocks = vi.hoisted(() => {
  const startup = vi.fn(async () => {});
  const initRustCrypto = vi.fn(async () => {});
  const startClient = vi.fn(async () => {});
  const stopClient = vi.fn();
  const clearStores = vi.fn(async () => {});
  const listeners = new Map<string, (s: string) => void>();
  const createClient = vi.fn((opts: Record<string, unknown>) => ({
    getDeviceId: () => opts.deviceId,
    initRustCrypto,
    startClient,
    stopClient,
    clearStores,
    getSyncState: () => null,
    on: (ev: string, fn: (s: string) => void) => listeners.set(ev, fn),
    removeListener: (ev: string) => listeners.delete(ev),
  }));
  const setLevel = vi.fn();
  return {
    startup,
    initRustCrypto,
    startClient,
    stopClient,
    clearStores,
    createClient,
    setLevel,
    listeners,
  };
});

vi.mock("matrix-js-sdk", () => ({
  createClient: mocks.createClient,
  ClientEvent: { Sync: "sync" },
  SyncState: { Prepared: "PREPARED", Syncing: "SYNCING" },
  IndexedDBStore: class {
    opts: unknown;
    constructor(opts: unknown) {
      this.opts = opts;
    }
    startup = mocks.startup;
  },
  MemoryStore: class {
    startup = mocks.startup;
  },
}));
vi.mock("matrix-js-sdk/lib/logger.js", () => ({ logger: { setLevel: mocks.setLevel } }));

import { createMatrixClient, startSync, stopAndClearClient } from "./client";
import type { StoredSession } from "./sessionStore";

const session: StoredSession = {
  version: 1,
  homeserverUrl: "http://localhost:8008",
  userId: "@alice:localhost",
  deviceId: "DEV1",
  accessToken: "syt_access",
  refreshToken: "syr_refresh",
  createdAt: 0,
};

describe("createMatrixClient", () => {
  beforeEach(() => vi.clearAllMocks());

  it("wires session, per-device stores, token callback and Rust crypto", async () => {
    const onTokenRefresh = vi.fn();
    const fakeIdb = {} as IDBFactory;
    await createMatrixClient({
      session,
      onTokenRefresh,
      indexedDB: fakeIdb,
      sdkLogLevel: "silent",
    });

    expect(mocks.setLevel).toHaveBeenCalledWith("silent");
    expect(mocks.startup).toHaveBeenCalledTimes(1);
    // The SDK requires startup() after the store is assigned to a client.
    expect(mocks.createClient.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.startup.mock.invocationCallOrder[0]!,
    );
    const args = mocks.createClient.mock.calls[0]![0];
    expect(args.baseUrl).toBe("http://localhost:8008");
    expect(args.userId).toBe("@alice:localhost");
    expect(args.deviceId).toBe("DEV1");
    expect(args.accessToken).toBe("syt_access");
    expect(args.refreshToken).toBe("syr_refresh");
    expect(args.useAuthorizationHeader).toBe(true);
    expect((args.store as { opts: { dbName: string } }).opts.dbName).toBe("cs-sync-DEV1");
    expect(mocks.initRustCrypto).toHaveBeenCalledWith({ cryptoDatabasePrefix: "cs-crypto-DEV1" });

    // Token rotation is forwarded with only the fields the server provided.
    (args.onTokenRefresh as (t: unknown) => void)({
      accessToken: "syt_new",
      refreshToken: "syr_new",
    });
    expect(onTokenRefresh).toHaveBeenCalledWith({
      accessToken: "syt_new",
      refreshToken: "syr_new",
    });
  });

  it("falls back to in-memory stores when IndexedDB is absent (tests/Node only)", async () => {
    const saved = globalThis.indexedDB;
    // @ts-expect-error: simulate an environment without IndexedDB
    delete globalThis.indexedDB;
    try {
      await createMatrixClient({ session, onTokenRefresh: vi.fn(), sdkLogLevel: "silent" });
      expect(mocks.initRustCrypto).toHaveBeenCalledWith({ useIndexedDB: false });
    } finally {
      globalThis.indexedDB = saved;
    }
  });

  it("startSync and stopAndClearClient delegate to the client", async () => {
    const client = await createMatrixClient({
      session,
      onTokenRefresh: vi.fn(),
      indexedDB: {} as IDBFactory,
      sdkLogLevel: "silent",
    });
    const syncing = startSync(client, { initialSyncLimit: 5, pollTimeout: 1000 });
    expect(mocks.startClient).toHaveBeenCalledWith({ initialSyncLimit: 5, pollTimeout: 1000 });
    mocks.listeners.get("sync")!("PREPARED"); // first sync lands → startSync resolves
    await syncing;
    await stopAndClearClient(client);
    expect(mocks.stopClient).toHaveBeenCalled();
    // Regression: without the prefix the SDK would delete "matrix-js-sdk::matrix-sdk-crypto"
    // and leave this device's crypto store (its keys) behind.
    expect(mocks.clearStores).toHaveBeenCalledWith({ cryptoDatabasePrefix: "cs-crypto-DEV1" });
  });
});

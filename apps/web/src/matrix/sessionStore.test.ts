import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import {
  SessionStorageUnavailableError,
  clearSession,
  deviceDatabaseNames,
  loadSession,
  saveSession,
  type StoredSession,
} from "./sessionStore";

const session: StoredSession = {
  version: 1,
  homeserverUrl: "http://localhost:8008",
  userId: "@alice:localhost",
  deviceId: "ABCDEFGHIJ",
  accessToken: "syt_test_access_token_value",
  refreshToken: "syr_test_refresh_token_value",
  accessTokenExpiresAt: 1_800_000_000_000,
  createdAt: 1_700_000_000_000,
};

describe("sessionStore", () => {
  let idb: IDBFactory;
  beforeEach(() => {
    idb = new IDBFactory(); // fresh database per test
  });

  it("returns null when nothing is stored", async () => {
    expect(await loadSession(idb)).toBeNull();
  });

  it("round-trips a session and clears it", async () => {
    await saveSession(session, idb);
    expect(await loadSession(idb)).toEqual(session);
    await clearSession(idb);
    expect(await loadSession(idb)).toBeNull();
  });

  it("overwrites rather than accumulates", async () => {
    await saveSession(session, idb);
    await saveSession({ ...session, accessToken: "syt_rotated" }, idb);
    expect((await loadSession(idb))?.accessToken).toBe("syt_rotated");
  });

  it("ignores an unreadable or foreign record", async () => {
    // Write junk directly, then expect loadSession to treat it as absent.
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = idb.open("cs-session", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("session");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve) => {
      const tx = db.transaction("session", "readwrite");
      tx.objectStore("session").put({ version: 99, nonsense: true }, "current");
      tx.oncomplete = () => resolve();
    });
    db.close();
    expect(await loadSession(idb)).toBeNull();
  });

  it("fails loudly when IndexedDB is unavailable", async () => {
    const broken = {
      open: () => {
        throw new Error("blocked by browser");
      },
    } as unknown as IDBFactory;
    await expect(loadSession(broken)).rejects.toBeInstanceOf(SessionStorageUnavailableError);
  });

  it("names every per-device database for a wipe", () => {
    const names = deviceDatabaseNames("DEV1");
    expect(names).toContain("matrix-js-sdk:cs-sync-DEV1");
    expect(names.some((n) => n.startsWith("cs-crypto-DEV1"))).toBe(true);
  });
});

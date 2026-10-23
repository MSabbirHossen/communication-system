import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { CryptoEvent } from "matrix-js-sdk/lib/crypto-api/index.js";
import type { MatrixClient } from "./client";
import { watchSecurityEvents } from "./sessionEvents";

const ME = "@alice:localhost";

function fakeClient(initialDevices: string[], master: string | null = "master-1") {
  const em = new EventEmitter();
  const devices = new Set(initialDevices);
  const state = { master };
  const crypto = {
    getUserDeviceInfo: vi.fn(
      async () => new Map([[ME, new Map([...devices].map((d) => [d, {}]))]]),
    ),
    getCrossSigningKeyId: vi.fn(async () => state.master),
  };
  const client = {
    getUserId: () => ME,
    getCrypto: () => crypto,
    on: (e: string, cb: (...a: unknown[]) => void) => em.on(e, cb),
    removeListener: (e: string, cb: (...a: unknown[]) => void) => em.removeListener(e, cb),
  } as unknown as MatrixClient;
  const flush = () => new Promise((r) => setTimeout(r, 0));
  return { client, em, devices, state, crypto, flush };
}

describe("security events", () => {
  it("reports only devices added after subscribing, once each", async () => {
    const f = fakeClient(["DEVTEST", "PHONE1"]);
    const onNotice = vi.fn();
    watchSecurityEvents(f.client, onNotice);
    await f.flush();

    f.em.emit(CryptoEvent.DevicesUpdated, [ME], false);
    await f.flush();
    expect(onNotice).not.toHaveBeenCalled();

    f.devices.add("TABLET9");
    f.em.emit(CryptoEvent.DevicesUpdated, ["@bob:localhost"], false);
    await f.flush();
    expect(onNotice).not.toHaveBeenCalled();

    f.em.emit(CryptoEvent.DevicesUpdated, [ME], false);
    await f.flush();
    expect(onNotice).toHaveBeenCalledWith({ kind: "new_device", deviceIds: ["TABLET9"] });

    f.em.emit(CryptoEvent.DevicesUpdated, [ME], false);
    await f.flush();
    expect(onNotice).toHaveBeenCalledTimes(1);
  });

  it("reports an identity change only when the master key is replaced", async () => {
    const f = fakeClient(["DEVTEST"]);
    const onNotice = vi.fn();
    watchSecurityEvents(f.client, onNotice);
    await f.flush();

    // Trust changes re-emit KeysChanged without a new master key: not an identity change.
    f.em.emit(CryptoEvent.KeysChanged, {});
    f.em.emit(CryptoEvent.UserTrustStatusChanged, ME, {});
    await f.flush();
    expect(onNotice).not.toHaveBeenCalled();

    f.state.master = "master-2";
    f.em.emit(CryptoEvent.UserTrustStatusChanged, "@bob:localhost", {});
    await f.flush();
    expect(onNotice).not.toHaveBeenCalled();

    f.em.emit(CryptoEvent.KeysChanged, {});
    await f.flush();
    expect(onNotice).toHaveBeenCalledWith({ kind: "identity_changed" });
    f.em.emit(CryptoEvent.UserTrustStatusChanged, ME, {});
    await f.flush();
    expect(onNotice).toHaveBeenCalledTimes(1);
  });

  it("reports key backup being disabled", async () => {
    const f = fakeClient(["DEVTEST"]);
    const onNotice = vi.fn();
    watchSecurityEvents(f.client, onNotice);
    f.em.emit(CryptoEvent.KeyBackupStatus, true);
    expect(onNotice).not.toHaveBeenCalled();
    f.em.emit(CryptoEvent.KeyBackupStatus, false);
    expect(onNotice).toHaveBeenCalledWith({ kind: "backup_disabled" });
  });

  it("stops reporting after unsubscribe", async () => {
    const f = fakeClient(["DEVTEST"]);
    const onNotice = vi.fn();
    const stop = watchSecurityEvents(f.client, onNotice);
    await f.flush();
    stop();
    f.devices.add("TABLET9");
    f.em.emit(CryptoEvent.DevicesUpdated, [ME], false);
    f.em.emit(CryptoEvent.KeyBackupStatus, false);
    await f.flush();
    expect(onNotice).not.toHaveBeenCalled();
    expect(f.em.eventNames()).toEqual([]);
  });

  it("does nothing without a crypto backend", () => {
    const client = { getUserId: () => ME, getCrypto: () => undefined } as unknown as MatrixClient;
    expect(() => watchSecurityEvents(client, vi.fn())()).not.toThrow();
  });
});

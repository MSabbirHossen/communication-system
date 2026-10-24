import { describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { MatrixClient } from "matrix-js-sdk";
import {
  DEFAULT_SETTINGS,
  SETTINGS_EVENT_TYPE,
  applyPresence,
  parseSettings,
  readSettings,
  watchSettings,
  writeSettings,
} from "./settings";

function fakeClient(content?: unknown) {
  const em = new EventEmitter();
  const state = { content };
  const setAccountData = vi.fn(async (_type: string, c: unknown) => {
    state.content = c;
    return {};
  });
  const setSyncPresence = vi.fn(async () => {});
  const setPresence = vi.fn(async () => {});
  const client = {
    getAccountData: (type: string) =>
      type === SETTINGS_EVENT_TYPE && state.content !== undefined
        ? { getContent: () => state.content }
        : undefined,
    setAccountData,
    setSyncPresence,
    setPresence,
    on: (e: string, cb: (...a: unknown[]) => void) => em.on(e, cb),
    removeListener: (e: string, cb: (...a: unknown[]) => void) => em.removeListener(e, cb),
  } as unknown as MatrixClient;
  return { client, em, setAccountData, setSyncPresence, setPresence };
}

describe("user settings", () => {
  it("defaults to private receipts, shared presence and generic notification text", () => {
    expect(parseSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS).toEqual({
      shareReadReceipts: false,
      sharePresence: true,
      notificationPreview: "generic",
    });
  });

  it("never trusts the shape of stored content", () => {
    expect(parseSettings("junk")).toEqual(DEFAULT_SETTINGS);
    expect(
      parseSettings({ shareReadReceipts: "yes", sharePresence: 0, notificationPreview: "full" }),
    ).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings({ shareReadReceipts: true, notificationPreview: "sender" })).toEqual({
      shareReadReceipts: true,
      sharePresence: true,
      notificationPreview: "sender",
    });
  });

  it("reads, merges and writes settings as the client's own account data", async () => {
    const { client, setAccountData } = fakeClient({ sharePresence: false });
    expect(readSettings(client)).toEqual({ ...DEFAULT_SETTINGS, sharePresence: false });
    const next = await writeSettings(client, { shareReadReceipts: true });
    expect(next).toEqual({
      shareReadReceipts: true,
      sharePresence: false,
      notificationPreview: "generic",
    });
    expect(setAccountData).toHaveBeenCalledWith(SETTINGS_EVENT_TYPE, next);
    expect(readSettings(client)).toEqual(next);
  });

  it("notifies on changes to its own account-data type only", () => {
    const { client, em } = fakeClient();
    const cb = vi.fn();
    const stop = watchSettings(client, cb);
    em.emit("accountData", { getType: () => "m.direct", getContent: () => ({}) });
    expect(cb).not.toHaveBeenCalled();
    em.emit("accountData", {
      getType: () => SETTINGS_EVENT_TYPE,
      getContent: () => ({ notificationPreview: "off" }),
    });
    expect(cb).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, notificationPreview: "off" });
    stop();
    expect(em.eventNames()).toEqual([]);
  });

  it("publishes online or offline presence to the sync loop from the setting", async () => {
    const { client, setSyncPresence, setPresence } = fakeClient();
    await applyPresence(client, DEFAULT_SETTINGS);
    expect(setSyncPresence).toHaveBeenLastCalledWith("online");
    expect(setPresence).not.toHaveBeenCalled();
    await applyPresence(client, { ...DEFAULT_SETTINGS, sharePresence: false });
    expect(setSyncPresence).toHaveBeenLastCalledWith("offline");
    expect(setPresence).toHaveBeenCalledWith({ presence: "offline" });
  });
});

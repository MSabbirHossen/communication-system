import { describe, expect, it, vi } from "vitest";
import { KeychainAccess } from "@aparajita/capacitor-secure-storage";
import { secureSessionStore, type SessionPlugin } from "./secureSession";
import { testSession } from "../test/session";

function fakePlugin() {
  const items = new Map<string, unknown>();
  const calls = { prefix: "", sync: true, accesses: [] as unknown[] };
  return {
    items,
    calls,
    setKeyPrefix: vi.fn(async (p: string) => {
      calls.prefix = p;
    }),
    setSynchronize: vi.fn(async (s: boolean) => {
      calls.sync = s;
    }),
    get: vi.fn(async (key: string) => items.get(key) ?? null),
    set: vi.fn(async (key: string, data: unknown, _c?: boolean, _s?: boolean, access?: unknown) => {
      items.set(key, data);
      calls.accesses.push(access);
    }),
    remove: vi.fn(async (key: string) => items.delete(key)),
  };
}

describe("secure session store", () => {
  it("round-trips the session with a project prefix, no cloud sync and a device-bound access class", async () => {
    const plugin = fakePlugin();
    const store = secureSessionStore(plugin as unknown as SessionPlugin);
    expect(await store.loadSession()).toBeNull();
    await store.saveSession(testSession);
    expect(await store.loadSession()).toEqual(testSession);
    expect(plugin.calls.prefix).toBe("cs.");
    expect(plugin.calls.sync).toBe(false);
    expect(plugin.calls.accesses).toEqual([KeychainAccess.afterFirstUnlockThisDeviceOnly]);
    expect(plugin.setKeyPrefix).toHaveBeenCalledTimes(1);
    await store.clearSession();
    expect(await store.loadSession()).toBeNull();
    expect(plugin.items.size).toBe(0);
  });

  it("ignores an unreadable record instead of trusting its shape", async () => {
    const plugin = fakePlugin();
    plugin.items.set("session", { version: 1, userId: 42 });
    expect(await secureSessionStore(plugin as unknown as SessionPlugin).loadSession()).toBeNull();
  });
});

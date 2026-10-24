import { describe, expect, it, vi } from "vitest";
import { acquireTabLease, leaseName, type LocksLike } from "./tabLease";

/** A tiny Web Locks emulation: one holder per name, ifAvailable and steal semantics. */
function fakeLocks(): LocksLike & { holders(): string[] } {
  const held = new Map<string, { reject: (e: Error) => void; done: Promise<unknown> }>();
  return {
    holders: () => [...held.keys()],
    request(name, options, callback) {
      if (held.has(name) && !options.steal) {
        if (options.ifAvailable) return Promise.resolve(callback(null));
        return Promise.reject(new Error("waiting is not emulated"));
      }
      if (held.has(name) && options.steal) {
        held.get(name)!.reject(new DOMException("stolen", "AbortError"));
        held.delete(name);
      }
      return new Promise((resolve, reject) => {
        const lock = { name };
        const done = Promise.resolve(callback(lock));
        held.set(name, { reject, done });
        void done.then((v) => {
          if (held.get(name)?.done === done) held.delete(name);
          resolve(v);
        });
      });
    },
  };
}

describe("tab lease", () => {
  it("the first tab holds the lease, a second tab does not", async () => {
    const locks = fakeLocks();
    const lostA = vi.fn();
    const a = await acquireTabLease("DEV1", lostA, locks);
    expect(a.held).toBe(true);
    expect(locks.holders()).toEqual([leaseName("DEV1")]);
    const lostB = vi.fn();
    const b = await acquireTabLease("DEV1", lostB, locks);
    expect(b.held).toBe(false);
    expect(lostA).not.toHaveBeenCalled();
    expect(lostB).not.toHaveBeenCalled();
    // A different device is independent.
    expect((await acquireTabLease("DEV2", vi.fn(), locks)).held).toBe(true);
  });

  it("taking over moves the lease and tells the previous holder", async () => {
    const locks = fakeLocks();
    const lostA = vi.fn();
    const a = await acquireTabLease("DEV1", lostA, locks);
    const b = await acquireTabLease("DEV1", vi.fn(), locks);
    await b.takeOver();
    await new Promise((r) => setTimeout(r, 0));
    expect(b.held).toBe(true);
    expect(a.held).toBe(false);
    expect(lostA).toHaveBeenCalledTimes(1);
    // The previous holder can take it back.
    await a.takeOver();
    await new Promise((r) => setTimeout(r, 0));
    expect(a.held).toBe(true);
    expect(b.held).toBe(false);
  });

  it("releasing lets another tab acquire without a take-over, and is not reported as a loss", async () => {
    const locks = fakeLocks();
    const lostA = vi.fn();
    const a = await acquireTabLease("DEV1", lostA, locks);
    a.release();
    await new Promise((r) => setTimeout(r, 0));
    expect(a.held).toBe(false);
    expect(lostA).not.toHaveBeenCalled();
    expect(locks.holders()).toEqual([]);
    expect((await acquireTabLease("DEV1", vi.fn(), locks)).held).toBe(true);
  });

  it("assumes a single tab when the browser has no locks API", async () => {
    const lease = await acquireTabLease("DEV1", vi.fn(), undefined);
    expect(lease.held).toBe(true);
    await lease.takeOver();
    lease.release();
  });
});

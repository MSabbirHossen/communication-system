import { describe, expect, it } from "vitest";
import { installPromiseWithResolvers, withResolversPolyfill } from "./polyfills";

type Ctor = PromiseConstructor & { withResolvers?: unknown };

// A detached constructor stands in for an old WebView's `Promise`, so the test never has
// to remove the host's own implementation.
function oldWebViewPromise(): Ctor {
  const ctor = function () {} as unknown as Ctor;
  return ctor;
}

describe("Promise.withResolvers shim (ADR-0006, WebViews older than Chrome 119)", () => {
  it("installs on a constructor that lacks the helper, non-enumerably", () => {
    const ctor = oldWebViewPromise();
    expect(installPromiseWithResolvers(ctor)).toBe(true);
    expect(typeof ctor.withResolvers).toBe("function");
    expect(Object.keys(ctor)).not.toContain("withResolvers");
    const desc = Object.getOwnPropertyDescriptor(ctor, "withResolvers");
    expect(desc?.writable).toBe(true);
    expect(desc?.configurable).toBe(true);
  });

  it("leaves an existing implementation untouched", () => {
    const ctor = oldWebViewPromise();
    const native = () => ({}) as never;
    ctor.withResolvers = native;
    expect(installPromiseWithResolvers(ctor)).toBe(false);
    expect(ctor.withResolvers).toBe(native);
    expect(installPromiseWithResolvers(Promise)).toBe(false);
  });

  it("resolves and rejects through the returned functions", async () => {
    const ok = withResolversPolyfill<string>();
    ok.resolve("pong");
    await expect(ok.promise).resolves.toBe("pong");

    const failed = withResolversPolyfill<string>();
    failed.reject(new Error("revoked"));
    await expect(failed.promise).rejects.toThrow("revoked");
  });

  it("is usable the way the SDK uses the native helper", async () => {
    // matrix-js-sdk awaits `deferred.promise` while another task calls `deferred.resolve()`.
    const deferred = withResolversPolyfill<void>();
    const waiter = deferred.promise.then(() => "woke");
    setTimeout(() => deferred.resolve(), 0);
    expect(await waiter).toBe("woke");
  });
});

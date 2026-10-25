// Runtime shims for the oldest WebViews the mobile shell supports (ADR-0006).
//
// Vite's `build.target` lowers syntax only; it adds no runtime polyfills. The one API the
// bundle uses without a feature check is `Promise.withResolvers` (matrix-js-sdk 44:
// rust-crypto/OutgoingRequestsManager, rust-crypto/verification, client, http-api). It
// arrived in Chrome 119 and Safari 17.4; the Android API 34 emulator image ships System
// WebView 113, and devices at the API 24 floor may run older WebViews still. Everything
// else newer than that in the bundle (`Uint8Array.fromBase64`, `URL.canParse`) is
// feature-checked by its caller.
//
// This module must be the first import of the entry point so it runs before any SDK chunk.

interface PromiseWithResolvers<T> {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

// The workspace compiles against lib ES2022, which has no declaration for the ES2024 helper.
type PromiseCtorWithResolvers = PromiseConstructor & {
  withResolvers?: <T>() => PromiseWithResolvers<T>;
};

export function withResolversPolyfill<T>(): PromiseWithResolvers<T> {
  let resolve!: PromiseWithResolvers<T>["resolve"];
  let reject!: PromiseWithResolvers<T>["reject"];
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Installs the shim on `ctor` when it has no `withResolvers`. Returns true when it did. */
export function installPromiseWithResolvers(ctor: PromiseConstructor = Promise): boolean {
  const target = ctor as PromiseCtorWithResolvers;
  if (typeof target.withResolvers === "function") return false;
  Object.defineProperty(target, "withResolvers", {
    value: withResolversPolyfill,
    writable: true,
    configurable: true,
    enumerable: false,
  });
  return true;
}

installPromiseWithResolvers();

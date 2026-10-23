// Holds the secret-storage private key for the SDK's CryptoCallbacks while a setup or
// restore is in progress. The key lives in memory only, is cleared after use, and is never
// written to any app store (the SDK keeps what it needs inside its own crypto store).
import { decodeRecoveryKey, encodeRecoveryKey } from "matrix-js-sdk/lib/crypto-api/recovery-key.js";
import type { CryptoCallbacks } from "./client";

export class InvalidRecoveryKeyError extends Error {
  constructor() {
    super("invalid recovery key");
    this.name = "InvalidRecoveryKeyError";
  }
}

export class SecretStorageKeyHolder {
  private key: Uint8Array | null = null;
  private keyId: string | null = null;

  /** Callbacks to pass to createClient. */
  callbacks(): CryptoCallbacks {
    return {
      getSecretStorageKey: async ({ keys }) => {
        if (!this.key) return null;
        const id = this.keyId && keys[this.keyId] ? this.keyId : Object.keys(keys)[0];
        return id ? [id, this.key as Uint8Array<ArrayBuffer>] : null;
      },
      cacheSecretStorageKey: (keyId, _info, key) => {
        this.keyId = keyId;
        this.key = key;
      },
    };
  }

  /** Decode a user-entered recovery key (base58, groups of 4). Throws InvalidRecoveryKeyError. */
  provideEncoded(encoded: string): void {
    try {
      this.key = decodeRecoveryKey(encoded.replace(/\s+/g, " ").trim());
    } catch {
      throw new InvalidRecoveryKeyError();
    }
  }

  provideRaw(key: Uint8Array, keyId?: string): void {
    this.key = key;
    this.keyId = keyId ?? null;
  }

  has(): boolean {
    return this.key !== null;
  }

  clear(): void {
    this.key = null;
    this.keyId = null;
  }
}

/** Display form of a raw key, for showing to the user exactly once. */
export function encodeForDisplay(key: Uint8Array): string {
  const encoded = encodeRecoveryKey(key);
  if (!encoded) throw new Error("could not encode recovery key");
  return encoded;
}

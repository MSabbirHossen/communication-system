import { describe, expect, it, vi } from "vitest";
import { MatrixError } from "matrix-js-sdk";
import { ensureCryptoReady, getCryptoReadiness } from "./cryptoSetup";
import { SecretStorageKeyHolder } from "./recoveryKey";
import { UiaCancelled } from "./uia";
import type { MatrixClient } from "./client";

// A deterministic 32-byte key and its base58 form, computed with the SDK's own encoder.
import { encodeRecoveryKey } from "matrix-js-sdk/lib/crypto-api/recovery-key.js";
const RAW_KEY = new Uint8Array(32).map((_, i) => i * 7 + 1);
const ENCODED_KEY = encodeRecoveryKey(RAW_KEY)!;

interface FakeState {
  crossSigningReady: boolean;
  secretStorageReady: boolean;
  backupVersion: string | null;
  accountHasCrossSigning: boolean;
  requireUia: boolean;
  storedKeyRaw: Uint8Array | null;
}

function fakeClient(state: FakeState) {
  const crypto = {
    isCrossSigningReady: vi.fn(async () => state.crossSigningReady),
    isSecretStorageReady: vi.fn(async () => state.secretStorageReady),
    getActiveSessionBackupVersion: vi.fn(async () => state.backupVersion),
    userHasCrossSigningKeys: vi.fn(async () => state.accountHasCrossSigning),
    bootstrapCrossSigning: vi.fn(
      async (opts: {
        authUploadDeviceSigningKeys?: (mr: (a: unknown) => Promise<void>) => Promise<void>;
      }) => {
        if (opts.authUploadDeviceSigningKeys) {
          let attempts = 0;
          await opts.authUploadDeviceSigningKeys(async (auth) => {
            attempts++;
            if (state.requireUia && !auth) {
              throw new MatrixError(
                {
                  errcode: "M_FORBIDDEN",
                  session: "uia-1",
                  flows: [{ stages: ["m.login.password"] }],
                },
                401,
              );
            }
            if (auth && (auth as { password?: string }).password !== "correct horse") {
              throw new MatrixError({ errcode: "M_FORBIDDEN", error: "bad" }, 401);
            }
          });
          expect(attempts).toBeGreaterThan(0);
        }
        state.crossSigningReady = true;
      },
    ),
    createRecoveryKeyFromPassphrase: vi.fn(async () => ({
      privateKey: RAW_KEY,
      encodedPrivateKey: ENCODED_KEY,
      keyInfo: {},
    })),
    bootstrapSecretStorage: vi.fn(async () => {
      state.secretStorageReady = true;
    }),
    checkKeyBackupAndEnable: vi.fn(async () => {
      state.backupVersion = "1";
      return {
        backupInfo: { version: "1" },
        trustInfo: { trusted: true, matchesDecryptionKey: true },
      };
    }),
    loadSessionBackupPrivateKeyFromSecretStorage: vi.fn(async () => {}),
    restoreKeyBackup: vi.fn(async () => ({ imported: 3, total: 3 })),
  };
  const secretStorage = {
    getDefaultKeyId: vi.fn(async () => (state.storedKeyRaw ? "key1" : null)),
    getKey: vi.fn(async () =>
      state.storedKeyRaw ? ["key1", { algorithm: "m.secret_storage.v1.aes-hmac-sha2" }] : null,
    ),
    checkKey: vi.fn(
      async (key: Uint8Array) =>
        !!state.storedKeyRaw && Buffer.from(key).equals(Buffer.from(state.storedKeyRaw)),
    ),
  };
  const client = {
    getCrypto: () => crypto,
    getUserId: () => "@alice:localhost",
    secretStorage,
  } as unknown as MatrixClient;
  return { client, crypto, secretStorage };
}

const freshAccount = (): FakeState => ({
  crossSigningReady: false,
  secretStorageReady: false,
  backupVersion: null,
  accountHasCrossSigning: false,
  requireUia: true,
  storedKeyRaw: null,
});
const additionalDevice = (): FakeState => ({
  crossSigningReady: false,
  secretStorageReady: false,
  backupVersion: "1",
  accountHasCrossSigning: true,
  requireUia: false,
  storedKeyRaw: RAW_KEY,
});

function prompts(overrides: Partial<Parameters<typeof ensureCryptoReady>[2]> = {}) {
  const steps: string[] = [];
  return {
    steps,
    prompts: {
      requestPassword: vi.fn(async () => "correct horse"),
      requestRecoveryKey: vi.fn(async () => ENCODED_KEY),
      showRecoveryKey: vi.fn(async () => {}),
      onStep: (s: string) => steps.push(s),
      ...overrides,
    },
  };
}

describe("getCryptoReadiness", () => {
  it("reports the four readiness facts", async () => {
    const { client } = fakeClient(additionalDevice());
    expect(await getCryptoReadiness(client)).toEqual({
      crossSigningReady: false,
      secretStorageReady: false,
      keyBackupEnabled: true,
      accountHasCrossSigning: true,
    });
  });
});

describe("ensureCryptoReady on the first device", () => {
  it("bootstraps cross-signing (with password UIA), secret storage, backup, and shows the key once", async () => {
    const state = freshAccount();
    const { client, crypto } = fakeClient(state);
    const holder = new SecretStorageKeyHolder();
    const p = prompts();
    const outcome = await ensureCryptoReady(client, holder, p.prompts);
    expect(outcome).toEqual({ outcome: "created", keyBackupEnabled: true });
    expect(p.prompts.requestPassword).toHaveBeenCalledTimes(1);
    expect(crypto.bootstrapCrossSigning).toHaveBeenCalledWith(
      expect.objectContaining({ setupNewCrossSigning: true }),
    );
    expect(crypto.bootstrapSecretStorage).toHaveBeenCalledWith(
      expect.objectContaining({ setupNewSecretStorage: true, setupNewKeyBackup: true }),
    );
    expect(p.prompts.showRecoveryKey).toHaveBeenCalledWith(ENCODED_KEY);
    expect(p.prompts.showRecoveryKey).toHaveBeenCalledTimes(1);
    expect(holder.has()).toBe(false); // key is not retained after setup
    expect(p.steps).toEqual(["checking", "cross_signing", "secret_storage", "key_backup"]);
  });

  it("aborts cleanly when the user cancels the password prompt", async () => {
    const { client, crypto } = fakeClient(freshAccount());
    const p = prompts({
      requestPassword: vi.fn(async () => {
        throw new UiaCancelled();
      }),
    });
    await expect(
      ensureCryptoReady(client, new SecretStorageKeyHolder(), p.prompts),
    ).rejects.toBeInstanceOf(UiaCancelled);
    expect(crypto.bootstrapSecretStorage).not.toHaveBeenCalled();
    expect(p.prompts.showRecoveryKey).not.toHaveBeenCalled();
  });

  it("returns already_ready without prompting when the device is set up", async () => {
    const state = { ...additionalDevice(), crossSigningReady: true, secretStorageReady: true };
    const { client } = fakeClient(state);
    const p = prompts();
    expect(await ensureCryptoReady(client, new SecretStorageKeyHolder(), p.prompts)).toEqual({
      outcome: "already_ready",
    });
    expect(p.prompts.requestPassword).not.toHaveBeenCalled();
    expect(p.prompts.requestRecoveryKey).not.toHaveBeenCalled();
  });
});

describe("ensureCryptoReady on an additional device", () => {
  it("restores identity and history with the recovery key", async () => {
    const { client, crypto } = fakeClient(additionalDevice());
    const holder = new SecretStorageKeyHolder();
    const p = prompts();
    const outcome = await ensureCryptoReady(client, holder, p.prompts);
    expect(outcome).toEqual({ outcome: "restored", keyBackupEnabled: true, keysRestored: 3 });
    expect(crypto.bootstrapCrossSigning).toHaveBeenCalledWith({});
    expect(crypto.loadSessionBackupPrivateKeyFromSecretStorage).toHaveBeenCalled();
    expect(crypto.restoreKeyBackup).toHaveBeenCalled();
    expect(holder.has()).toBe(false);
  });

  it("re-prompts on a wrong key and a malformed key, then succeeds", async () => {
    const { client, secretStorage } = fakeClient(additionalDevice());
    const wrong = encodeRecoveryKey(new Uint8Array(32).fill(9))!;
    const answers = ["not a key at all", wrong, ENCODED_KEY];
    const p = prompts({ requestRecoveryKey: vi.fn(async () => answers.shift() ?? null) });
    const outcome = await ensureCryptoReady(client, new SecretStorageKeyHolder(), p.prompts);
    expect(outcome.outcome).toBe("restored");
    expect(p.prompts.requestRecoveryKey).toHaveBeenCalledTimes(3);
    expect(p.prompts.requestRecoveryKey).toHaveBeenLastCalledWith(3);
    expect(secretStorage.checkKey).toHaveBeenCalledTimes(2); // malformed key never reaches checkKey
  });

  it("lets the user skip and stay unverified (verify from another device later)", async () => {
    const { client, crypto } = fakeClient(additionalDevice());
    const p = prompts({ requestRecoveryKey: vi.fn(async () => null) });
    expect(await ensureCryptoReady(client, new SecretStorageKeyHolder(), p.prompts)).toEqual({
      outcome: "skipped_needs_verification",
    });
    expect(crypto.bootstrapCrossSigning).not.toHaveBeenCalled();
  });
});

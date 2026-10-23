// Secure device setup (APP_FLOW 5.1 step E/F, UI brief §6.3). Establishes, on this device:
//   1. cross-signing identity for the account (first device creates it; later devices
//      restore its private keys from secret storage with the recovery key, or stay
//      unverified until verified from another device),
//   2. secret storage ("4S") protected by a recovery key that only the user holds,
//   3. server-side encrypted key backup for message keys.
// Nothing here implements cryptography: every step is an SDK call (ADR-0001).
import type { MatrixClient } from "matrix-js-sdk";
import type { CryptoApi } from "matrix-js-sdk/lib/crypto-api/index.js";
import type { SecretStorageKeyHolder } from "./recoveryKey";
import { InvalidRecoveryKeyError, encodeForDisplay } from "./recoveryKey";
import { passwordUia, type RequestPassword } from "./uia";

export type SetupStep =
  "checking" | "cross_signing" | "secret_storage" | "key_backup" | "restoring";

export interface CryptoReadiness {
  crossSigningReady: boolean;
  secretStorageReady: boolean;
  keyBackupEnabled: boolean;
  /** The account already has cross-signing keys published (set up on another device). */
  accountHasCrossSigning: boolean;
}

export interface SetupPrompts {
  /** Password for UIA when the server protects a step; reject (UiaCancelled) to abort. */
  requestPassword: RequestPassword;
  /** Additional device: ask for the recovery key; resolve null to skip (verify later from another device). */
  requestRecoveryKey(attempt: number): Promise<string | null>;
  /** First device: show the newly generated key; resolve once the user has acknowledged it. */
  showRecoveryKey(encodedKey: string): Promise<void>;
  onStep?(step: SetupStep): void;
}

export type SetupOutcome =
  | { outcome: "already_ready" }
  | { outcome: "created"; keyBackupEnabled: boolean }
  | { outcome: "restored"; keyBackupEnabled: boolean; keysRestored: number }
  | { outcome: "skipped_needs_verification" };

function cryptoOf(client: MatrixClient): CryptoApi {
  const c = client.getCrypto();
  if (!c) throw new Error("crypto backend not initialised");
  return c;
}

export async function getCryptoReadiness(client: MatrixClient): Promise<CryptoReadiness> {
  const crypto = cryptoOf(client);
  const [crossSigningReady, secretStorageReady, backup, accountHasCrossSigning] = await Promise.all(
    [
      crypto.isCrossSigningReady(),
      crypto.isSecretStorageReady(),
      crypto.getActiveSessionBackupVersion(),
      crypto.userHasCrossSigningKeys(undefined, true),
    ],
  );
  return {
    crossSigningReady,
    secretStorageReady,
    keyBackupEnabled: backup !== null,
    accountHasCrossSigning,
  };
}

/**
 * Bring this device to a ready encryption state, prompting the user only when needed.
 * Idempotent: a device that is already ready returns immediately.
 */
export async function ensureCryptoReady(
  client: MatrixClient,
  holder: SecretStorageKeyHolder,
  prompts: SetupPrompts,
): Promise<SetupOutcome> {
  const crypto = cryptoOf(client);
  const userId = client.getUserId();
  if (!userId) throw new Error("client has no user id");
  prompts.onStep?.("checking");
  const readiness = await getCryptoReadiness(client);
  if (readiness.crossSigningReady && readiness.secretStorageReady) {
    await enableBackup(crypto, prompts);
    return { outcome: "already_ready" };
  }

  if (readiness.accountHasCrossSigning) {
    return restoreOnAdditionalDevice(client, crypto, holder, prompts);
  }
  return createOnFirstDevice(client, crypto, holder, prompts, userId);
}

async function enableBackup(crypto: CryptoApi, prompts: SetupPrompts): Promise<boolean> {
  prompts.onStep?.("key_backup");
  const check = await crypto.checkKeyBackupAndEnable();
  return check !== null && check.trustInfo.trusted;
}

async function createOnFirstDevice(
  client: MatrixClient,
  crypto: CryptoApi,
  holder: SecretStorageKeyHolder,
  prompts: SetupPrompts,
  userId: string,
): Promise<SetupOutcome> {
  prompts.onStep?.("cross_signing");
  await crypto.bootstrapCrossSigning({
    setupNewCrossSigning: true,
    authUploadDeviceSigningKeys: passwordUia<void>(userId, prompts.requestPassword),
  });

  prompts.onStep?.("secret_storage");
  const generated = await crypto.createRecoveryKeyFromPassphrase();
  // The SDK will ask our callbacks for this key while it encrypts secrets into 4S.
  holder.provideRaw(generated.privateKey);
  try {
    await crypto.bootstrapSecretStorage({
      createSecretStorageKey: async () => generated,
      setupNewSecretStorage: true,
      setupNewKeyBackup: true,
    });
    const keyBackupEnabled = await enableBackup(crypto, prompts);
    const encoded = generated.encodedPrivateKey ?? encodeForDisplay(generated.privateKey);
    await prompts.showRecoveryKey(encoded);
    return { outcome: "created", keyBackupEnabled };
  } finally {
    holder.clear();
  }
}

async function restoreOnAdditionalDevice(
  client: MatrixClient,
  crypto: CryptoApi,
  holder: SecretStorageKeyHolder,
  prompts: SetupPrompts,
): Promise<SetupOutcome> {
  const defaultKeyId = await client.secretStorage.getDefaultKeyId();
  const keyInfo = defaultKeyId ? await client.secretStorage.getKey(defaultKeyId) : null;

  for (let attempt = 1; ; attempt++) {
    const entered = await prompts.requestRecoveryKey(attempt);
    if (entered === null) {
      // User will verify this device from another one (emoji/SAS) instead.
      return { outcome: "skipped_needs_verification" };
    }
    try {
      holder.provideEncoded(entered);
    } catch (e) {
      if (e instanceof InvalidRecoveryKeyError && attempt < 5) continue;
      throw e;
    }
    // Check the key against the stored key description before using it, so a wrong key is
    // reported as such instead of surfacing as a decryption failure deep in the SDK.
    if (keyInfo) {
      const ok = await client.secretStorage.checkKey(
        (await holder.callbacks().getSecretStorageKey!(
          { keys: { [keyInfo[0]]: keyInfo[1] } },
          "check",
        ))![1],
        keyInfo[1],
      );
      if (!ok) {
        holder.clear();
        if (attempt < 5) continue;
        throw new InvalidRecoveryKeyError();
      }
    }
    break;
  }

  try {
    prompts.onStep?.("restoring");
    // Pulls the cross-signing private keys out of secret storage and signs this device.
    await crypto.bootstrapCrossSigning({});
    await crypto.bootstrapSecretStorage({});
    await crypto.loadSessionBackupPrivateKeyFromSecretStorage();
    const keyBackupEnabled = await enableBackup(crypto, prompts);
    let keysRestored = 0;
    if (keyBackupEnabled) {
      const result = await crypto.restoreKeyBackup();
      keysRestored = result.imported;
    }
    return { outcome: "restored", keyBackupEnabled, keysRestored };
  } finally {
    holder.clear();
  }
}

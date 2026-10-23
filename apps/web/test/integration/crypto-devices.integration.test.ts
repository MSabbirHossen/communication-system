import { randomBytes } from "node:crypto";
import { afterAll, expect, it } from "vitest";
import { encodeRecoveryKey } from "matrix-js-sdk/lib/crypto-api/recovery-key.js";
import { onSessionLoggedOut } from "../../src/matrix/client";
import {
  ensureCryptoReady,
  getCryptoReadiness,
  type SetupStep,
} from "../../src/matrix/cryptoSetup";
import { getOwnIdentity, listOwnDevices, revokeDevice } from "../../src/matrix/devices";
import { SecretStorageKeyHolder } from "../../src/matrix/recoveryKey";
import { UiaCancelled } from "../../src/matrix/uia";
import {
  describeIntegration,
  deviceClient,
  errorOf,
  loginAgain,
  newAccount,
  plainClient,
  stopClients,
  waitFor,
} from "./helpers";

describeIntegration("secure device setup, recovery key restore, device list and revocation", () => {
  afterAll(stopClients);

  it("first device creates identity, secret storage and backup; a second device restores with the recovery key", async () => {
    const acct = await newAccount("crypto");
    const holderA = new SecretStorageKeyHolder();
    const a = await deviceClient(acct.session, holderA);

    expect(await getCryptoReadiness(a)).toEqual({
      crossSigningReady: false,
      secretStorageReady: false,
      keyBackupEnabled: false,
      accountHasCrossSigning: false,
    });

    let recoveryKey = "";
    const steps: SetupStep[] = [];
    const created = await ensureCryptoReady(a, holderA, {
      requestPassword: async () => acct.password,
      requestRecoveryKey: async () => {
        throw new Error("the first device must not be asked for a recovery key");
      },
      showRecoveryKey: async (k) => {
        recoveryKey = k;
      },
      onStep: (s) => steps.push(s),
    });
    expect(created).toEqual({ outcome: "created", keyBackupEnabled: true });
    expect(recoveryKey).toMatch(/^[A-Za-z0-9 ]{40,}$/);
    expect(steps).toEqual(["checking", "cross_signing", "secret_storage", "key_backup"]);
    expect(holderA.has()).toBe(false); // the key is not retained after setup
    expect(await getCryptoReadiness(a)).toEqual({
      crossSigningReady: true,
      secretStorageReady: true,
      keyBackupEnabled: true,
      accountHasCrossSigning: true,
    });
    expect(await ensureCryptoReady(a, holderA, neverPrompt())).toEqual({
      outcome: "already_ready",
    });

    // Second device: wrong key first, then the real one.
    const sessionB = await loginAgain(acct, "Test device B");
    const holderB = new SecretStorageKeyHolder();
    const b = await deviceClient(sessionB, holderB);
    // Secret storage "ready" is judged from synced account data, so it can already read true
    // on a device that does not hold the key; cross-signing readiness is what gates setup.
    expect(await getCryptoReadiness(b)).toMatchObject({
      crossSigningReady: false,
      keyBackupEnabled: false,
      accountHasCrossSigning: true,
    });
    const attempts: number[] = [];
    const restored = await ensureCryptoReady(b, holderB, {
      requestPassword: async () => acct.password,
      requestRecoveryKey: async (attempt) => {
        attempts.push(attempt);
        return attempt === 1 ? encodeRecoveryKey(randomBytes(32))! : recoveryKey;
      },
      showRecoveryKey: async () => {
        throw new Error("an additional device must not be shown a new key");
      },
    });
    expect(attempts).toEqual([1, 2]);
    expect(restored).toMatchObject({ outcome: "restored", keyBackupEnabled: true });
    expect(await getCryptoReadiness(b)).toEqual({
      crossSigningReady: true,
      secretStorageReady: true,
      keyBackupEnabled: true,
      accountHasCrossSigning: true,
    });

    // Device list from A: both devices, B verified through cross-signing, fingerprints agree.
    const idB = await getOwnIdentity(b);
    const viewB = await waitFor("A sees B as verified", async () => {
      const d = (await listOwnDevices(a)).find((x) => x.id === sessionB.deviceId);
      return d?.verification === "verified" ? d : null;
    });
    expect(viewB.isCurrent).toBe(false);
    expect(viewB.hasKeys).toBe(true);
    expect(viewB.fingerprint).toBe(idB.fingerprint);
    expect((await listOwnDevices(a))[0]).toMatchObject({
      id: acct.session.deviceId,
      isCurrent: true,
      verification: "verified",
    });

    // Revocation needs re-authentication; a cancelled prompt changes nothing.
    await expect(
      revokeDevice(a, sessionB.deviceId, async () => {
        throw new UiaCancelled();
      }),
    ).rejects.toBeInstanceOf(UiaCancelled);
    expect((await listOwnDevices(a)).map((d) => d.id)).toContain(sessionB.deviceId);

    const loggedOut = new Promise<{ softLogout: boolean }>((resolve) =>
      onSessionLoggedOut(b, resolve),
    );
    await revokeDevice(a, sessionB.deviceId, async () => acct.password);
    expect((await listOwnDevices(a)).map((d) => d.id)).not.toContain(sessionB.deviceId);

    const err = await errorOf(plainClient(sessionB).whoami());
    expect(err?.errcode).toBe("M_UNKNOWN_TOKEN");
    expect((err?.data as { soft_logout?: boolean }).soft_logout).not.toBe(true);
    // The revoked client's own sync notices and reports a hard logout.
    expect(await loggedOut).toEqual({ softLogout: false });
  });
});

function neverPrompt() {
  return {
    requestPassword: async () => {
      throw new Error("unexpected password prompt");
    },
    requestRecoveryKey: async () => {
      throw new Error("unexpected recovery key prompt");
    },
    showRecoveryKey: async () => {
      throw new Error("unexpected recovery key display");
    },
  };
}

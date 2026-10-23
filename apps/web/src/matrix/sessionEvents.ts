// Security-relevant signals from the SDK, turned into user-facing notices (THREAT_MODEL
// TM-03, TM-08): a new device appeared on my account, my account's identity (master
// cross-signing key) was replaced, or key backup was disabled. Notices describe state;
// they never claim trust.
import type { MatrixClient } from "matrix-js-sdk";
import { CryptoEvent } from "matrix-js-sdk/lib/crypto-api/index.js";

export type SecurityNotice =
  | { kind: "new_device"; deviceIds: string[] }
  | { kind: "identity_changed" }
  | { kind: "backup_disabled" };

/**
 * Subscribe to own-account security events. A snapshot of my devices and master key is
 * taken when subscribing; later events are compared against it so that only real
 * additions or replacements produce a notice (the SDK emits `KeysChanged` for any
 * own-identity update, including trust changes, which are not identity changes).
 * Returns an unsubscribe function.
 */
export function watchSecurityEvents(
  client: MatrixClient,
  onNotice: (n: SecurityNotice) => void,
): () => void {
  const userId = client.getUserId();
  const crypto = client.getCrypto();
  if (!userId || !crypto) return () => {};

  let stopped = false;
  let known: Set<string> | null = null;
  let masterKeyId: string | null = null;

  const ownDeviceIds = async (): Promise<string[]> => {
    const map = (await crypto.getUserDeviceInfo([userId])).get(userId);
    return map ? [...map.keys()] : [];
  };
  const snapshot = (async () => {
    const [ids, master] = await Promise.all([ownDeviceIds(), crypto.getCrossSigningKeyId()]);
    known = new Set(ids);
    masterKeyId = master;
  })().catch(() => {
    known = new Set();
  });

  const onDevicesUpdated = async (users: string[]) => {
    if (!users.includes(userId)) return;
    await snapshot;
    if (stopped || !known) return;
    const added: string[] = [];
    for (const id of await ownDeviceIds()) {
      if (!known.has(id)) {
        known.add(id);
        added.push(id);
      }
    }
    if (!stopped && added.length > 0) onNotice({ kind: "new_device", deviceIds: added });
  };
  const onIdentity = async (changedUserId?: string) => {
    if (changedUserId !== undefined && changedUserId !== userId) return;
    await snapshot;
    if (stopped) return;
    const now = await crypto.getCrossSigningKeyId();
    if (stopped || !now) return;
    if (masterKeyId && now !== masterKeyId) {
      masterKeyId = now;
      onNotice({ kind: "identity_changed" });
    } else if (!masterKeyId) {
      masterKeyId = now;
    }
  };
  const onTrustChanged = (changedUserId: string) => void onIdentity(changedUserId);
  const onKeysChanged = () => void onIdentity();
  const onBackupStatus = (enabled: boolean) => {
    if (!enabled) onNotice({ kind: "backup_disabled" });
  };

  client.on(CryptoEvent.DevicesUpdated, onDevicesUpdated);
  client.on(CryptoEvent.UserTrustStatusChanged, onTrustChanged);
  client.on(CryptoEvent.KeysChanged, onKeysChanged);
  client.on(CryptoEvent.KeyBackupStatus, onBackupStatus);
  return () => {
    stopped = true;
    client.removeListener(CryptoEvent.DevicesUpdated, onDevicesUpdated);
    client.removeListener(CryptoEvent.UserTrustStatusChanged, onTrustChanged);
    client.removeListener(CryptoEvent.KeysChanged, onKeysChanged);
    client.removeListener(CryptoEvent.KeyBackupStatus, onBackupStatus);
  };
}

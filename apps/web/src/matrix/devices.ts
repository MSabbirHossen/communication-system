// Own devices/sessions (UI brief §6.8, TRD §5.3): list with verification state from the
// SDK, rename, and revoke under password re-authentication. Verification state comes only
// from the crypto backend; nothing here can mark a device verified on its own.
import type { MatrixClient } from "matrix-js-sdk";
import { withPasswordUia, type RequestPassword } from "./uia";

export type DeviceVerification = "verified" | "unverified" | "unknown";

export interface DeviceSummary {
  id: string;
  name: string | null;
  isCurrent: boolean;
  /** Epoch ms of the last request the server saw from this device, when known. */
  lastSeenTs: number | undefined;
  /** ed25519 fingerprint of the device's signing key, when published. */
  fingerprint: string | null;
  verification: DeviceVerification;
  /** The device has published encryption keys (unencrypted-only clients have none). */
  hasKeys: boolean;
}

export interface OwnIdentity {
  userId: string;
  deviceId: string;
  /** This device's ed25519 fingerprint, formatted in groups of 4 for comparison. */
  fingerprint: string | null;
  crossSigningVerified: boolean;
}

/** Format a base64 key in groups of four characters, the way verification UIs show it. */
export function formatFingerprint(key: string | null | undefined): string | null {
  if (!key) return null;
  return key.match(/.{1,4}/g)?.join(" ") ?? key;
}

function requireUserId(client: MatrixClient): string {
  const userId = client.getUserId();
  if (!userId) throw new Error("client has no user id");
  return userId;
}

export async function listOwnDevices(client: MatrixClient): Promise<DeviceSummary[]> {
  const userId = requireUserId(client);
  const currentId = client.getDeviceId();
  const crypto = client.getCrypto();
  const [{ devices }, keyed] = await Promise.all([
    client.getDevices(),
    crypto ? crypto.getUserDeviceInfo([userId], true) : Promise.resolve(null),
  ]);
  const keyMap = keyed?.get(userId);

  const summaries = await Promise.all(
    devices.map(async (d): Promise<DeviceSummary> => {
      const dev = keyMap?.get(d.device_id);
      let verification: DeviceVerification = "unknown";
      if (crypto && dev) {
        const status = await crypto.getDeviceVerificationStatus(userId, d.device_id);
        verification = status ? (status.isVerified() ? "verified" : "unverified") : "unknown";
      }
      return {
        id: d.device_id,
        name: d.display_name ?? null,
        isCurrent: d.device_id === currentId,
        lastSeenTs: d.last_seen_ts,
        fingerprint: formatFingerprint(dev?.getFingerprint()),
        verification,
        hasKeys: dev !== undefined,
      };
    }),
  );
  // Current device first, then most recently seen.
  return summaries.sort((a, b) => {
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
    return (b.lastSeenTs ?? 0) - (a.lastSeenTs ?? 0);
  });
}

export async function getOwnIdentity(client: MatrixClient): Promise<OwnIdentity> {
  const userId = requireUserId(client);
  const deviceId = client.getDeviceId() ?? "";
  const crypto = client.getCrypto();
  if (!crypto) return { userId, deviceId, fingerprint: null, crossSigningVerified: false };
  const keys = await crypto.getOwnDeviceKeys();
  const status = await crypto.getDeviceVerificationStatus(userId, deviceId);
  return {
    userId,
    deviceId,
    fingerprint: formatFingerprint(keys.ed25519),
    crossSigningVerified: status?.crossSigningVerified ?? false,
  };
}

export async function renameDevice(
  client: MatrixClient,
  deviceId: string,
  name: string,
): Promise<void> {
  await client.setDeviceDetails(deviceId, { display_name: name.trim().slice(0, 100) });
}

/**
 * Delete a device (revoke its session). The homeserver requires re-authentication; the
 * password is requested through `requestPassword` and never stored. Revocation stops the
 * device's future access; it cannot erase what that device already downloaded (TRD §5.3).
 */
export async function revokeDevice(
  client: MatrixClient,
  deviceId: string,
  requestPassword: RequestPassword,
): Promise<void> {
  const userId = requireUserId(client);
  await withPasswordUia(userId, requestPassword, (auth) => client.deleteDevice(deviceId, auth));
}

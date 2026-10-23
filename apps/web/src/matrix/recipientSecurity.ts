// Security state of the other participant in a conversation, read from the SDK only
// (ADR-0004, THREAT_MODEL TM-03): whether their identity (cross-signing) is verified by us,
// whether it changed since we verified it, and which of their devices are unverified.
// Nothing here changes trust; the screens only display it and link to verification.
import type { MatrixClient } from "matrix-js-sdk";
import { CryptoEvent } from "matrix-js-sdk/lib/crypto-api/index.js";
import { formatFingerprint } from "./devices";
import { flowFromRequest, type VerificationFlow } from "./verification";

export type RecipientIdentity =
  | "verified" // we verified this person's cross-signing identity and it is unchanged
  | "changed" // we had verified them, but their identity was replaced since (TM-03)
  | "unverified" // never verified by us
  | "unknown"; // no crypto backend

export interface RecipientDevice {
  id: string;
  name: string | null;
  fingerprint: string | null;
  verified: boolean;
}

export interface RecipientSecurity {
  userId: string;
  identity: RecipientIdentity;
  devices: RecipientDevice[];
  unverifiedCount: number;
}

export async function getRecipientSecurity(
  client: MatrixClient,
  userId: string,
): Promise<RecipientSecurity> {
  const crypto = client.getCrypto();
  if (!crypto) return { userId, identity: "unknown", devices: [], unverifiedCount: 0 };
  const [status, deviceMap] = await Promise.all([
    crypto.getUserVerificationStatus(userId),
    crypto.getUserDeviceInfo([userId], true),
  ]);
  const identity: RecipientIdentity = status.isCrossSigningVerified()
    ? "verified"
    : status.wasCrossSigningVerified() || status.needsUserApproval
      ? "changed"
      : "unverified";
  const devices: RecipientDevice[] = [];
  for (const device of deviceMap.get(userId)?.values() ?? []) {
    const v = await crypto.getDeviceVerificationStatus(userId, device.deviceId);
    devices.push({
      id: device.deviceId,
      name: device.displayName ?? null,
      fingerprint: formatFingerprint(device.getFingerprint()),
      verified: v?.isVerified() ?? false,
    });
  }
  devices.sort((a, b) => a.id.localeCompare(b.id));
  return {
    userId,
    identity,
    devices,
    unverifiedCount: devices.filter((d) => !d.verified).length,
  };
}

/** Call `cb` when this user's trust status or device list changes. Returns an unsubscribe. */
export function watchRecipientSecurity(
  client: MatrixClient,
  userId: string,
  cb: () => void,
): () => void {
  const onTrust = (changed: string) => {
    if (changed === userId) cb();
  };
  const onDevices = (users: string[]) => {
    if (users.includes(userId)) cb();
  };
  client.on(CryptoEvent.UserTrustStatusChanged, onTrust);
  client.on(CryptoEvent.DevicesUpdated, onDevices);
  return () => {
    client.removeListener(CryptoEvent.UserTrustStatusChanged, onTrust);
    client.removeListener(CryptoEvent.DevicesUpdated, onDevices);
  };
}

/** Ask the other participant to verify with me through the conversation's room (SAS). */
export async function requestUserVerification(
  client: MatrixClient,
  userId: string,
  roomId: string,
): Promise<VerificationFlow> {
  const crypto = client.getCrypto();
  if (!crypto) throw new Error("crypto backend not initialised");
  const request = await crypto.requestVerificationDM(userId, roomId);
  return flowFromRequest(request);
}

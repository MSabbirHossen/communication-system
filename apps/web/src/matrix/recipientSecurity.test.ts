import { describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { MatrixClient } from "matrix-js-sdk";
import { getRecipientSecurity, watchRecipientSecurity } from "./recipientSecurity";

const BOB = "@bob:localhost";

export function fakeRecipientCrypto(opts: {
  crossSigningVerified?: boolean;
  wasVerified?: boolean;
  needsUserApproval?: boolean;
  devices?: Array<{ id: string; name?: string; fingerprint?: string; verified: boolean }>;
}) {
  const devices = opts.devices ?? [];
  return {
    getUserVerificationStatus: vi.fn(async () => ({
      isCrossSigningVerified: () => opts.crossSigningVerified ?? false,
      wasCrossSigningVerified: () => opts.wasVerified ?? false,
      needsUserApproval: opts.needsUserApproval ?? false,
    })),
    getUserDeviceInfo: vi.fn(
      async () =>
        new Map([
          [
            BOB,
            new Map(
              devices.map((d) => [
                d.id,
                { deviceId: d.id, displayName: d.name, getFingerprint: () => d.fingerprint },
              ]),
            ),
          ],
        ]),
    ),
    getDeviceVerificationStatus: vi.fn(async (_u: string, id: string) => ({
      isVerified: () => devices.find((d) => d.id === id)?.verified ?? false,
    })),
  };
}

function clientWith(crypto: unknown) {
  const em = new EventEmitter();
  const client = {
    getCrypto: () => crypto,
    on: (e: string, cb: (...a: unknown[]) => void) => em.on(e, cb),
    removeListener: (e: string, cb: (...a: unknown[]) => void) => em.removeListener(e, cb),
  } as unknown as MatrixClient;
  return { client, em };
}

describe("recipient security", () => {
  it("reports an unverified identity and lists devices with their verification state", async () => {
    const crypto = fakeRecipientCrypto({
      devices: [
        { id: "PHONE", name: "Phone", fingerprint: "AAAABBBBCCCCDDDD", verified: false },
        { id: "LAPTOP", name: "Laptop", fingerprint: "EEEEFFFFGGGGHHHH", verified: true },
      ],
    });
    const { client } = clientWith(crypto);
    const s = await getRecipientSecurity(client, BOB);
    expect(s.identity).toBe("unverified");
    expect(s.devices.map((d) => d.id)).toEqual(["LAPTOP", "PHONE"]);
    expect(s.devices[1]).toEqual({
      id: "PHONE",
      name: "Phone",
      fingerprint: "AAAA BBBB CCCC DDDD",
      verified: false,
    });
    expect(s.unverifiedCount).toBe(1);
    expect(crypto.getUserDeviceInfo).toHaveBeenCalledWith([BOB], true);
  });

  it("distinguishes verified, changed (previously verified or needing approval) and unverified", async () => {
    const verified = clientWith(fakeRecipientCrypto({ crossSigningVerified: true })).client;
    expect((await getRecipientSecurity(verified, BOB)).identity).toBe("verified");
    const changed = clientWith(fakeRecipientCrypto({ wasVerified: true })).client;
    expect((await getRecipientSecurity(changed, BOB)).identity).toBe("changed");
    const approval = clientWith(fakeRecipientCrypto({ needsUserApproval: true })).client;
    expect((await getRecipientSecurity(approval, BOB)).identity).toBe("changed");
    const none = clientWith(undefined).client;
    expect(await getRecipientSecurity(none, BOB)).toEqual({
      userId: BOB,
      identity: "unknown",
      devices: [],
      unverifiedCount: 0,
    });
  });

  it("watches trust and device updates for that user only", () => {
    const { client, em } = clientWith(fakeRecipientCrypto({}));
    const cb = vi.fn();
    const stop = watchRecipientSecurity(client, BOB, cb);
    em.emit("userTrustStatusChanged", "@carol:localhost", {});
    em.emit("crypto.devicesUpdated", ["@carol:localhost"], false);
    expect(cb).not.toHaveBeenCalled();
    em.emit("userTrustStatusChanged", BOB, {});
    em.emit("crypto.devicesUpdated", [BOB, "@carol:localhost"], false);
    expect(cb).toHaveBeenCalledTimes(2);
    stop();
    em.emit("userTrustStatusChanged", BOB, {});
    expect(cb).toHaveBeenCalledTimes(2);
    expect(em.eventNames()).toEqual([]);
  });
});

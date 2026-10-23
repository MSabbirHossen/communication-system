import { describe, expect, it, vi } from "vitest";
import { MatrixError } from "matrix-js-sdk";
import type { MatrixClient } from "./client";
import {
  formatFingerprint,
  getOwnIdentity,
  listOwnDevices,
  renameDevice,
  revokeDevice,
} from "./devices";

function fakeClient(opts: { withCrypto?: boolean } = {}) {
  const devices = [
    { device_id: "OLD1", display_name: "Web · Firefox on Linux", last_seen_ts: 1000 },
    { device_id: "CUR1", display_name: "Web · Chrome on Windows", last_seen_ts: 5000 },
    { device_id: "NOKEYS", display_name: "legacy client", last_seen_ts: 3000 },
  ];
  const deviceMap = new Map([
    ["CUR1", { getFingerprint: () => "AAAABBBBCCCCDDDD" }],
    ["OLD1", { getFingerprint: () => "EEEEFFFFGGGGHHHH" }],
  ]);
  const crypto = {
    getUserDeviceInfo: vi.fn(async () => new Map([["@alice:localhost", deviceMap]])),
    getDeviceVerificationStatus: vi.fn(async (_u: string, id: string) => ({
      isVerified: () => id === "CUR1",
      crossSigningVerified: id === "CUR1",
    })),
    getOwnDeviceKeys: vi.fn(async () => ({ ed25519: "AAAABBBBCCCCDDDD", curve25519: "x" })),
  };
  const deleteDevice = vi.fn(async (_id: string, auth?: unknown) => {
    if (!auth) {
      throw new MatrixError(
        { errcode: "M_FORBIDDEN", session: "s", flows: [{ stages: ["m.login.password"] }] },
        401,
      );
    }
    return {};
  });
  const setDeviceDetails = vi.fn(async () => ({}));
  const client = {
    getUserId: () => "@alice:localhost",
    getDeviceId: () => "CUR1",
    getCrypto: () => (opts.withCrypto === false ? undefined : crypto),
    getDevices: vi.fn(async () => ({ devices })),
    deleteDevice,
    setDeviceDetails,
  } as unknown as MatrixClient;
  return { client, crypto, deleteDevice, setDeviceDetails };
}

describe("listOwnDevices", () => {
  it("merges server devices with SDK verification state, current device first", async () => {
    const { client } = fakeClient();
    const list = await listOwnDevices(client);
    expect(list.map((d) => d.id)).toEqual(["CUR1", "NOKEYS", "OLD1"]);
    expect(list[0]).toMatchObject({
      isCurrent: true,
      verification: "verified",
      fingerprint: "AAAA BBBB CCCC DDDD",
      hasKeys: true,
    });
    expect(list[2]).toMatchObject({ isCurrent: false, verification: "unverified", hasKeys: true });
    expect(list[1]).toMatchObject({ verification: "unknown", fingerprint: null, hasKeys: false });
  });
  it("reports unknown verification without a crypto backend", async () => {
    const { client } = fakeClient({ withCrypto: false });
    const list = await listOwnDevices(client);
    expect(list.every((d) => d.verification === "unknown")).toBe(true);
  });
});

describe("own identity and rename", () => {
  it("formats the fingerprint in groups of four", async () => {
    const { client } = fakeClient();
    expect(await getOwnIdentity(client)).toEqual({
      userId: "@alice:localhost",
      deviceId: "CUR1",
      fingerprint: "AAAA BBBB CCCC DDDD",
      crossSigningVerified: true,
    });
    expect(formatFingerprint(null)).toBeNull();
  });
  it("renames with a trimmed, bounded display name", async () => {
    const { client, setDeviceDetails } = fakeClient();
    await renameDevice(client, "OLD1", "  Laptop  ");
    expect(setDeviceDetails).toHaveBeenCalledWith("OLD1", { display_name: "Laptop" });
  });
});

describe("revokeDevice", () => {
  it("re-authenticates with the password when the server demands UIA", async () => {
    const { client, deleteDevice } = fakeClient();
    const ask = vi.fn(async () => "correct horse");
    await revokeDevice(client, "OLD1", ask);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(deleteDevice).toHaveBeenCalledTimes(2);
    expect(deleteDevice.mock.calls[1]![1]).toMatchObject({
      type: "m.login.password",
      password: "correct horse",
      session: "s",
    });
  });
});

import { afterAll, expect, it } from "vitest";
import { signOutOtherDevices } from "../../src/matrix/devices";
import { getOwnProfile, setDisplayName } from "../../src/matrix/profile";
import { lookupUser } from "../../src/matrix/rooms";
import { UiaCancelled } from "../../src/matrix/uia";
import {
  describeIntegration,
  deviceClient,
  errorOf,
  loginAgain,
  newAccount,
  plainClient,
  stopClients,
} from "./helpers";

describeIntegration("profile and bulk device sign-out", () => {
  afterAll(stopClients);

  it("a changed display name is what other users look up", async () => {
    const acct = await newAccount("prof");
    const peer = await newAccount("prof-peer");
    const client = plainClient(acct.session);
    expect((await getOwnProfile(client)).userId).toBe(acct.session.userId);
    expect(await setDisplayName(client, "  Alice Example ")).toBe("Alice Example");
    expect((await getOwnProfile(client)).displayName).toBe("Alice Example");
    expect(await lookupUser(plainClient(peer.session), acct.session.userId)).toEqual({
      found: true,
      userId: acct.session.userId,
      displayName: "Alice Example",
    });
  });

  it("signs out every other device under password re-auth; cancelling changes nothing", async () => {
    const acct = await newAccount("bulk");
    const second = await loginAgain(acct, "second");
    const third = await loginAgain(acct, "third");
    const client = await deviceClient(acct.session);
    await expect(
      signOutOtherDevices(client, async () => {
        throw new UiaCancelled();
      }),
    ).rejects.toBeInstanceOf(UiaCancelled);
    await plainClient(second).whoami();

    const gone = await signOutOtherDevices(client, async () => acct.password);
    expect(gone.sort()).toEqual([second.deviceId, third.deviceId].sort());
    expect((await errorOf(plainClient(second).whoami()))?.errcode).toBe("M_UNKNOWN_TOKEN");
    expect((await errorOf(plainClient(third).whoami()))?.errcode).toBe("M_UNKNOWN_TOKEN");
    await plainClient(acct.session).whoami();
    expect(await signOutOtherDevices(client, async () => acct.password)).toEqual([]);
  });
});

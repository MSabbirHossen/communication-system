import { afterAll, expect, it } from "vitest";
import { ensureCryptoReady, getCryptoReadiness } from "../../src/matrix/cryptoSetup";
import { listOwnDevices } from "../../src/matrix/devices";
import { SecretStorageKeyHolder } from "../../src/matrix/recoveryKey";
import {
  requestOwnDeviceVerification,
  watchIncomingOwnDeviceRequests,
  type VerificationFlow,
} from "../../src/matrix/verification";
import {
  describeIntegration,
  deviceClient,
  loginAgain,
  newAccount,
  stopClients,
  waitFor,
  withTimeout,
} from "./helpers";

/** First device set up (identity + 4S), second device signed in but deliberately unverified. */
async function twoDevices(prefix: string) {
  const acct = await newAccount(prefix);
  const a = await deviceClient(acct.session, new SecretStorageKeyHolder());
  await ensureCryptoReady(a, new SecretStorageKeyHolder(), {
    requestPassword: async () => acct.password,
    requestRecoveryKey: async () => null,
    showRecoveryKey: async () => {},
  });
  const sessionB = await loginAgain(acct, "Unverified device");
  const b = await deviceClient(sessionB, new SecretStorageKeyHolder());
  const skipped = await ensureCryptoReady(b, new SecretStorageKeyHolder(), {
    requestPassword: async () => acct.password,
    requestRecoveryKey: async () => null,
    showRecoveryKey: async () => {},
  });
  expect(skipped).toEqual({ outcome: "skipped_needs_verification" });
  const viewB = await waitFor("A sees B's keys", async () =>
    (await listOwnDevices(a)).find((d) => d.id === sessionB.deviceId && d.hasKeys),
  );
  expect(viewB.verification).toBe("unverified");
  return { acct, a, b, sessionB };
}

async function startSas(a: Awaited<ReturnType<typeof twoDevices>>) {
  const incoming = new Promise<VerificationFlow>((resolve) =>
    watchIncomingOwnDeviceRequests(a.b, resolve),
  );
  const flowA = await requestOwnDeviceVerification(a.a, a.sessionB.deviceId);
  expect(flowA.getState()).toMatchObject({ phase: "requested", initiatedByMe: true });
  const flowB = await withTimeout(incoming, 30_000, "B never received the verification request");
  expect(flowB.getState()).toMatchObject({
    phase: "requested",
    initiatedByMe: false,
    otherDeviceId: a.acct.session.deviceId,
  });

  await flowB.accept();
  await waitFor("A sees ready", () => flowA.getState().phase === "ready");
  await flowA.startSas();
  await waitFor(
    "both show SAS",
    () => flowA.getState().phase === "show_sas" && flowB.getState().phase === "show_sas",
  );
  expect(flowA.getState().emoji).toHaveLength(7);
  expect(flowA.getState().emoji).toEqual(flowB.getState().emoji);
  expect(flowA.getState().decimal).toEqual(flowB.getState().decimal);
  return { flowA, flowB };
}

function verificationOf(a: Awaited<ReturnType<typeof twoDevices>>) {
  return async () =>
    (await listOwnDevices(a.a)).find((d) => d.id === a.sessionB.deviceId)?.verification;
}

describeIntegration("own-device verification (SAS emoji)", () => {
  afterAll(stopClients);

  it("two devices of one account compare matching emoji and the new device becomes verified", async () => {
    const devices = await twoDevices("sas");
    const { flowA, flowB } = await startSas(devices);

    await Promise.all([flowA.confirmMatch(), flowB.confirmMatch()]);
    await waitFor(
      "both done",
      () => flowA.getState().phase === "done" && flowB.getState().phase === "done",
    );
    await waitFor(
      "A sees B as verified",
      async () => (await verificationOf(devices)()) === "verified",
    );
    // What the app's unverified-device notice relies on after a skip: once verified, the
    // device reports cross-signing ready (ADR-0003 D5, amended).
    await waitFor(
      "B reports cross-signing ready",
      async () => (await getCryptoReadiness(devices.b)).crossSigningReady,
    );
    flowA.dispose();
    flowB.dispose();
  });

  it("a reported mismatch cancels with m.mismatched_sas on both sides and leaves the device unverified", async () => {
    const devices = await twoDevices("mismatch");
    const { flowA, flowB } = await startSas(devices);

    flowB.reportMismatch();
    await waitFor(
      "both cancelled",
      () => flowA.getState().phase === "cancelled" && flowB.getState().phase === "cancelled",
    );
    expect(flowB.getState()).toMatchObject({ cancelCode: "m.mismatched_sas", cancelledByMe: true });
    expect(flowA.getState()).toMatchObject({
      cancelCode: "m.mismatched_sas",
      cancelledByMe: false,
    });
    expect(await verificationOf(devices)()).toBe("unverified");
    flowA.dispose();
    flowB.dispose();
  });
});

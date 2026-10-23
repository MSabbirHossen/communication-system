import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { CryptoEvent } from "matrix-js-sdk/lib/crypto-api/index.js";
import {
  VerificationPhase,
  VerificationRequestEvent,
  VerifierEvent,
  type ShowSasCallbacks,
  type VerificationRequest,
  type Verifier,
} from "matrix-js-sdk/lib/crypto-api/verification.js";
import type { MatrixClient } from "./client";
import {
  flowFromRequest,
  requestOwnDeviceVerification,
  watchIncomingOwnDeviceRequests,
  watchIncomingUserRequests,
} from "./verification";

const ME = "@alice:localhost";
export const EMOJI: Array<[string, string]> = [
  ["🐶", "Dog"],
  ["🐱", "Cat"],
  ["🦁", "Lion"],
  ["🐎", "Horse"],
  ["🦄", "Unicorn"],
  ["🐷", "Pig"],
  ["🐘", "Elephant"],
];

/** A verifier whose SAS the test reveals on demand, like the SDK does once both sides agree. */
function fakeVerifier() {
  const em = new EventEmitter();
  let sas: ShowSasCallbacks | null = null;
  const verify = vi.fn(() => new Promise<void>(() => {}));
  const verifier = {
    on: (e: string, cb: (...a: unknown[]) => void) => em.on(e, cb),
    off: (e: string, cb: (...a: unknown[]) => void) => em.off(e, cb),
    verify,
    getShowSasCallbacks: () => sas,
  } as unknown as Verifier;
  const showSas = () => {
    sas = {
      sas: { emoji: EMOJI, decimal: [1111, 2222, 3333] },
      confirm: vi.fn(async () => {}),
      mismatch: vi.fn(),
      cancel: vi.fn(),
    };
    em.emit(VerifierEvent.ShowSas, sas);
    return sas;
  };
  return { verifier, verify, showSas };
}

function fakeRequest(opts: { initiatedByMe?: boolean; isSelfVerification?: boolean } = {}) {
  const em = new EventEmitter();
  const state = {
    phase: VerificationPhase.Requested,
    verifier: undefined as Verifier | undefined,
    cancellationCode: null as string | null,
  };
  let lastVerifier: ReturnType<typeof fakeVerifier> | null = null;
  const setPhase = (p: VerificationPhase) => {
    state.phase = p;
    em.emit(VerificationRequestEvent.Change);
  };
  /** The other side (or the SDK) cancels with the given code. */
  const cancelFrom = (code: string) => {
    state.cancellationCode = code;
    setPhase(VerificationPhase.Cancelled);
  };
  /** The other side started SAS: a verifier appears on the request. */
  const otherSideStarted = () => {
    lastVerifier = fakeVerifier();
    state.verifier = lastVerifier.verifier;
    setPhase(VerificationPhase.Started);
    return lastVerifier;
  };
  const startVerification = vi.fn(async () => otherSideStarted().verifier);
  const accept = vi.fn(async () => setPhase(VerificationPhase.Ready));
  const cancel = vi.fn(async ({ code }: { code: string }) => cancelFrom(code));
  const request = {
    on: (e: string, cb: () => void) => em.on(e, cb),
    off: (e: string, cb: () => void) => em.off(e, cb),
    get phase() {
      return state.phase;
    },
    get verifier() {
      return state.verifier;
    },
    get cancellationCode() {
      return state.cancellationCode;
    },
    cancellingUserId: undefined,
    initiatedByMe: opts.initiatedByMe ?? true,
    isSelfVerification: opts.isSelfVerification ?? true,
    otherUserId: ME,
    otherDeviceId: "PHONE1",
    roomId: opts.isSelfVerification === false ? "!dm:localhost" : undefined,
    pending: true,
    accept,
    startVerification,
    cancel,
  };
  return {
    request: request as unknown as VerificationRequest,
    setPhase,
    cancelFrom,
    otherSideStarted,
    verifier: () => lastVerifier!,
    accept,
    startVerification,
    cancel,
    changeListeners: () => em.listenerCount(VerificationRequestEvent.Change),
  };
}

describe("verification flow", () => {
  it("outgoing: follows the request phases, starts SAS and exposes the emoji", async () => {
    const r = fakeRequest();
    const flow = flowFromRequest(r.request);
    const seen: string[] = [];
    flow.subscribe(() => seen.push(flow.getState().phase));
    expect(flow.getState()).toMatchObject({
      phase: "requested",
      initiatedByMe: true,
      otherDeviceId: "PHONE1",
      emoji: null,
      cancelCode: null,
    });

    r.setPhase(VerificationPhase.Ready);
    expect(flow.getState().phase).toBe("ready");

    await flow.startSas();
    expect(r.startVerification).toHaveBeenCalledWith("m.sas.v1");
    expect(r.verifier().verify).toHaveBeenCalledTimes(1);
    expect(flow.getState().phase).toBe("starting");

    const sas = r.verifier().showSas();
    expect(flow.getState().phase).toBe("show_sas");
    expect(flow.getState().emoji).toEqual(EMOJI);
    expect(flow.getState().decimal).toEqual([1111, 2222, 3333]);

    await flow.confirmMatch();
    expect(sas.confirm).toHaveBeenCalledTimes(1);
    expect(flow.getState().phase).toBe("confirming");

    r.setPhase(VerificationPhase.Done);
    expect(flow.getState().phase).toBe("done");
    expect(seen).toContain("show_sas");
    expect(seen.at(-1)).toBe("done");
  });

  it("incoming: accept, then the verifier the other side started is driven on this side", async () => {
    const r = fakeRequest({ initiatedByMe: false });
    const flow = flowFromRequest(r.request);
    expect(flow.getState().initiatedByMe).toBe(false);

    await flow.accept();
    expect(r.accept).toHaveBeenCalledTimes(1);
    expect(flow.getState().phase).toBe("ready");

    const v = r.otherSideStarted();
    expect(v.verify).toHaveBeenCalledTimes(1);
    expect(flow.getState().phase).toBe("starting");
    v.showSas();
    expect(flow.getState().phase).toBe("show_sas");
    // startSas on a request that already has a verifier must not start a second one.
    await flow.startSas();
    expect(r.startVerification).not.toHaveBeenCalled();
    expect(v.verify).toHaveBeenCalledTimes(1);
  });

  it("a mismatch is reported to the SDK and surfaces as m.mismatched_sas, cancelled by me", async () => {
    const r = fakeRequest();
    const flow = flowFromRequest(r.request);
    r.setPhase(VerificationPhase.Ready);
    await flow.startSas();
    const sas = r.verifier().showSas();
    flow.reportMismatch();
    expect(sas.mismatch).toHaveBeenCalledTimes(1);
    r.cancelFrom("m.mismatched_sas");
    expect(flow.getState()).toMatchObject({
      phase: "cancelled",
      cancelCode: "m.mismatched_sas",
      cancelledByMe: true,
    });
  });

  it("cancel sends m.user; a cancellation from the other side is not mine", async () => {
    const mine = fakeRequest();
    const flow = flowFromRequest(mine.request);
    await flow.cancel();
    expect(mine.cancel).toHaveBeenCalledWith(expect.objectContaining({ code: "m.user" }));
    expect(flow.getState()).toMatchObject({ phase: "cancelled", cancelledByMe: true });

    const theirs = fakeRequest();
    const flow2 = flowFromRequest(theirs.request);
    theirs.cancelFrom("m.timeout");
    expect(flow2.getState()).toMatchObject({
      phase: "cancelled",
      cancelCode: "m.timeout",
      cancelledByMe: false,
    });
  });

  it("confirmMatch before the SAS exists is an error, and dispose stops listening", async () => {
    const r = fakeRequest();
    const flow = flowFromRequest(r.request);
    await expect(flow.confirmMatch()).rejects.toThrow(/no SAS/);
    const cb = vi.fn();
    flow.subscribe(cb);
    expect(r.changeListeners()).toBe(1);
    flow.dispose();
    expect(r.changeListeners()).toBe(0);
    r.setPhase(VerificationPhase.Ready);
    expect(cb).not.toHaveBeenCalled();
  });
});

describe("incoming requests", () => {
  function fakeClient() {
    const em = new EventEmitter();
    const crypto = {
      requestDeviceVerification: vi.fn(async () => fakeRequest().request),
    };
    const client = {
      getUserId: () => ME,
      getCrypto: () => crypto,
      on: (e: string, cb: (...a: unknown[]) => void) => em.on(e, cb),
      removeListener: (e: string, cb: (...a: unknown[]) => void) => em.removeListener(e, cb),
    } as unknown as MatrixClient;
    return { client, em, crypto };
  }

  it("only surfaces self-verification requests and stops after unsubscribe", () => {
    const { client, em } = fakeClient();
    const cb = vi.fn();
    const stop = watchIncomingOwnDeviceRequests(client, cb);
    em.emit(
      CryptoEvent.VerificationRequestReceived,
      fakeRequest({ isSelfVerification: false }).request,
    );
    expect(cb).not.toHaveBeenCalled();
    em.emit(CryptoEvent.VerificationRequestReceived, fakeRequest({ initiatedByMe: false }).request);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0]![0].getState()).toMatchObject({
      phase: "requested",
      initiatedByMe: false,
      otherDeviceId: "PHONE1",
    });
    stop();
    em.emit(CryptoEvent.VerificationRequestReceived, fakeRequest().request);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("requests verification of one of my devices through the crypto API", async () => {
    const { client, crypto } = fakeClient();
    const flow = await requestOwnDeviceVerification(client, "PHONE1");
    expect(crypto.requestDeviceVerification).toHaveBeenCalledWith(ME, "PHONE1");
    expect(flow.getState().phase).toBe("requested");
  });
});

describe("incoming requests from other users", () => {
  it("surfaces only non-self requests with the room they travel in", () => {
    const em = new EventEmitter();
    const client = {
      getUserId: () => ME,
      on: (e: string, cb: (...a: unknown[]) => void) => em.on(e, cb),
      removeListener: (e: string, cb: (...a: unknown[]) => void) => em.removeListener(e, cb),
    } as unknown as MatrixClient;
    const cb = vi.fn();
    const stop = watchIncomingUserRequests(client, cb);
    em.emit(CryptoEvent.VerificationRequestReceived, fakeRequest({ initiatedByMe: false }).request);
    expect(cb).not.toHaveBeenCalled();
    const theirs = fakeRequest({ initiatedByMe: false, isSelfVerification: false });
    em.emit(CryptoEvent.VerificationRequestReceived, theirs.request);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0]![0].getState()).toMatchObject({
      initiatedByMe: false,
      otherUserId: ME,
      roomId: "!dm:localhost",
    });
    stop();
    expect(em.eventNames()).toEqual([]);
  });
});

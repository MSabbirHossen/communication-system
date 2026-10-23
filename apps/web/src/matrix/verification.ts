// Own-device verification with the protocol's SAS (emoji) method (APP_FLOW 5.4). A small
// observable wrapper over the SDK's VerificationRequest/Verifier so screens render a typed
// state and never decide trust themselves: only the SDK marks a device verified.
import type { MatrixClient } from "matrix-js-sdk";
import { CryptoEvent } from "matrix-js-sdk/lib/crypto-api/index.js";
import {
  VerificationPhase,
  VerificationRequestEvent,
  VerifierEvent,
  type ShowSasCallbacks,
  type VerificationRequest,
  type Verifier,
} from "matrix-js-sdk/lib/crypto-api/verification.js";

export const SAS_METHOD = "m.sas.v1";

export type FlowPhase =
  | "requested" // sent (outgoing) or received (incoming), waiting for the other side
  | "ready" // both sides agreed; SAS can start
  | "starting" // SAS negotiation in progress
  | "show_sas" // emoji to compare are available
  | "confirming" // user said they match; waiting for the other side
  | "done"
  | "cancelled";

export interface FlowState {
  phase: FlowPhase;
  initiatedByMe: boolean;
  otherDeviceId: string | undefined;
  /** [emoji, name] pairs, when phase is show_sas/confirming. */
  emoji: Array<[string, string]> | null;
  decimal: [number, number, number] | null;
  /** SDK cancellation code (e.g. m.user, m.mismatched_sas, m.timeout) when cancelled. */
  cancelCode: string | null;
  cancelledByMe: boolean;
}

export interface VerificationFlow {
  getState(): FlowState;
  subscribe(cb: () => void): () => void;
  /** Incoming request: agree to verify. */
  accept(): Promise<void>;
  /** Begin the emoji comparison (after both sides are ready). */
  startSas(): Promise<void>;
  /** The user says the emoji match. */
  confirmMatch(): Promise<void>;
  /** The user says the emoji differ: cancels with m.mismatched_sas. */
  reportMismatch(): void;
  cancel(): Promise<void>;
  dispose(): void;
}

function phaseOf(
  req: VerificationRequest,
  sas: ShowSasCallbacks | null,
  confirming: boolean,
): FlowPhase {
  switch (req.phase) {
    case VerificationPhase.Done:
      return "done";
    case VerificationPhase.Cancelled:
      return "cancelled";
    case VerificationPhase.Started:
      if (sas) return confirming ? "confirming" : "show_sas";
      return "starting";
    case VerificationPhase.Ready:
      return "ready";
    default:
      return "requested";
  }
}

export function flowFromRequest(request: VerificationRequest): VerificationFlow {
  const listeners = new Set<() => void>();
  let sas: ShowSasCallbacks | null = null;
  let confirming = false;
  let attachedVerifier: Verifier | null = null;
  let cancelledByMe = false;

  const compute = (): FlowState => ({
    phase: phaseOf(request, sas, confirming),
    initiatedByMe: request.initiatedByMe,
    otherDeviceId: request.otherDeviceId,
    emoji: sas?.sas.emoji ? sas.sas.emoji.map(([e, n]) => [e, n] as [string, string]) : null,
    decimal: sas?.sas.decimal ?? null,
    cancelCode: request.cancellationCode,
    cancelledByMe,
  });
  let state = compute();
  const update = () => {
    state = compute();
    listeners.forEach((l) => l());
  };

  const attachVerifier = (verifier: Verifier) => {
    if (attachedVerifier === verifier) return;
    attachedVerifier = verifier;
    const existing = verifier.getShowSasCallbacks();
    if (existing) sas = existing;
    verifier.on(VerifierEvent.ShowSas, (cb: ShowSasCallbacks) => {
      sas = cb;
      update();
    });
    verifier.on(VerifierEvent.Cancel, update);
    // verify() drives the protocol on this side; its rejection shows up as a cancelled phase.
    void verifier.verify().catch(update);
    update();
  };

  const onChange = () => {
    if (request.verifier) attachVerifier(request.verifier);
    update();
  };
  request.on(VerificationRequestEvent.Change, onChange);
  if (request.verifier) attachVerifier(request.verifier);

  return {
    getState: () => state,
    subscribe: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    accept: () => request.accept(),
    startSas: async () => {
      if (request.verifier) {
        attachVerifier(request.verifier);
        return;
      }
      const verifier = await request.startVerification(SAS_METHOD);
      attachVerifier(verifier);
    },
    confirmMatch: async () => {
      if (!sas) throw new Error("no SAS to confirm");
      confirming = true;
      update();
      await sas.confirm();
    },
    reportMismatch: () => {
      cancelledByMe = true;
      sas?.mismatch();
      update();
    },
    cancel: async () => {
      cancelledByMe = true;
      await request.cancel({ reason: "User cancelled", code: "m.user" });
      update();
    },
    dispose: () => {
      request.off(VerificationRequestEvent.Change, onChange);
      listeners.clear();
    },
  };
}

/** Ask one of my other devices to verify with this one. */
export async function requestOwnDeviceVerification(
  client: MatrixClient,
  otherDeviceId: string,
): Promise<VerificationFlow> {
  const crypto = client.getCrypto();
  const userId = client.getUserId();
  if (!crypto || !userId) throw new Error("crypto backend not initialised");
  const request = await crypto.requestDeviceVerification(userId, otherDeviceId);
  return flowFromRequest(request);
}

/** Incoming verification requests from my own other devices (other users' requests are ignored until Phase 3). */
export function watchIncomingOwnDeviceRequests(
  client: MatrixClient,
  cb: (flow: VerificationFlow) => void,
): () => void {
  const handler = (request: VerificationRequest) => {
    if (!request.isSelfVerification) return;
    cb(flowFromRequest(request));
  };
  client.on(CryptoEvent.VerificationRequestReceived, handler);
  return () => client.removeListener(CryptoEvent.VerificationRequestReceived, handler);
}

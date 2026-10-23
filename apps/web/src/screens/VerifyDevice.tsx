import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Link, useParams } from "react-router";
import { t } from "../i18n";
import { toAuthError, type AuthError } from "../matrix/errors";
import type { VerificationFlow } from "../matrix/verification";
import { useSession } from "../session/SessionProvider";
import { useSecurity } from "../session/security";
import { authErrorMessage } from "./auth";

function BackLink() {
  return (
    <Link to="/settings/devices" className="button">
      {t("verify.back")}
    </Link>
  );
}

/**
 * Renders one verification flow (APP_FLOW 5.4). The initiator starts the emoji
 * comparison once both sides are ready; the accepting side waits for it. Every outcome
 * other than the SDK's "done" keeps the device unverified and says so.
 */
function FlowView({ flow, deviceId }: { flow: VerificationFlow; deviceId: string }) {
  const state = useSyncExternalStore(flow.subscribe, flow.getState, flow.getState);
  const [actionError, setActionError] = useState<AuthError | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (state.phase === "ready" && state.initiatedByMe) {
      flow.startSas().catch((e: unknown) => setActionError(toAuthError(e)));
    }
  }, [flow, state.phase, state.initiatedByMe]);

  // Leaving the screen mid-flow cancels it (the device stays unverified). The cancel is
  // deferred a tick so a remount of the same flow does not cancel it.
  useEffect(() => {
    clearTimeout(leaveTimer.current);
    return () => {
      leaveTimer.current = setTimeout(() => {
        const { phase } = flow.getState();
        if (phase !== "done" && phase !== "cancelled") void flow.cancel().catch(() => undefined);
        flow.dispose();
      }, 0);
    };
  }, [flow]);

  const run = (p: Promise<void>) => p.catch((e: unknown) => setActionError(toAuthError(e)));

  let body: React.ReactNode;
  switch (state.phase) {
    case "requested":
      body = state.initiatedByMe ? (
        <>
          <p className="type-body" role="status">
            {t("verify.waiting.accept")}
          </p>
          <div className="actions">
            <button type="button" className="button" onClick={() => void run(flow.cancel())}>
              {t("verify.cancel")}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="type-body">{t("verify.incoming.body")}</p>
          <div className="actions">
            <button
              type="button"
              className="button button--primary"
              onClick={() => void run(flow.accept())}
            >
              {t("verify.accept")}
            </button>
            <button type="button" className="button" onClick={() => void run(flow.cancel())}>
              {t("verify.decline")}
            </button>
          </div>
        </>
      );
      break;
    case "ready":
    case "starting":
      body = (
        <>
          <p className="type-body" role="status">
            {state.initiatedByMe ? t("verify.starting") : t("verify.waiting.start")}
          </p>
          <div className="actions">
            <button type="button" className="button" onClick={() => void run(flow.cancel())}>
              {t("verify.cancel")}
            </button>
          </div>
        </>
      );
      break;
    case "show_sas":
    case "confirming":
      body = (
        <>
          <p className="type-body">{t("verify.intro")}</p>
          <ol className="emoji-grid" aria-label={t("verify.emoji.list")}>
            {(state.emoji ?? []).map(([glyph, name], i) => (
              <li key={i} className="emoji">
                <span className="emoji__glyph" aria-hidden="true">
                  {glyph}
                </span>
                <span className="emoji__name">{name}</span>
              </li>
            ))}
          </ol>
          {state.phase === "confirming" ? (
            <p className="type-body" role="status">
              {t("verify.confirming")}
            </p>
          ) : (
            <>
              <p className="type-body">{t("verify.compare")}</p>
              <div className="actions">
                <button
                  type="button"
                  className="button button--primary"
                  onClick={() => void run(flow.confirmMatch())}
                >
                  {t("verify.match")}
                </button>
                <button
                  type="button"
                  className="button button--danger"
                  onClick={() => flow.reportMismatch()}
                >
                  {t("verify.mismatch")}
                </button>
              </div>
            </>
          )}
        </>
      );
      break;
    case "done":
      body = (
        <>
          <p className="banner banner--ok" role="status">
            {t("verify.done.body")}
          </p>
          <div className="actions">
            <BackLink />
          </div>
        </>
      );
      break;
    case "cancelled":
      body = (
        <>
          <p className="banner banner--danger" role="alert">
            {state.cancelCode === "m.mismatched_sas"
              ? t("verify.cancelled.mismatch")
              : state.cancelledByMe
                ? t("verify.cancelled.user")
                : t("verify.cancelled.other")}{" "}
            {state.cancelCode && state.cancelCode !== "m.mismatched_sas" && (
              <code>{state.cancelCode}</code>
            )}
          </p>
          <p className="type-body">
            <span className="badge badge--warn">{t("devices.badge.unverified")}</span>{" "}
            <code>{deviceId}</code>
          </p>
          <div className="actions">
            <BackLink />
          </div>
        </>
      );
      break;
  }

  return (
    <>
      {actionError && (
        <p className="banner banner--danger" role="alert">
          {authErrorMessage(actionError)}
        </p>
      )}
      {body}
    </>
  );
}

export function VerifyDeviceScreen() {
  const { deviceId = "" } = useParams();
  const { client } = useSession();
  const security = useSecurity();
  const [flow, setFlow] = useState<VerificationFlow | null>(
    () => security.incomingFor(deviceId) ?? null,
  );
  const [error, setError] = useState<AuthError | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (flow || !client || !deviceId || started.current) return;
    started.current = true;
    security.requestVerification(client, deviceId).then(
      (f) => setFlow(f),
      (e: unknown) => setError(toAuthError(e)),
    );
  }, [client, deviceId, flow, security]);

  return (
    <section className="pane" aria-labelledby="verify-title">
      <h1 id="verify-title" className="type-heading pane__title">
        {t("verify.title")}
      </h1>
      <p className="type-meta text-muted">
        {t("verify.deviceLabel")} <code>{deviceId}</code>
      </p>
      {error ? (
        <>
          <p className="banner banner--danger" role="alert">
            {authErrorMessage(error)}
          </p>
          <div className="actions">
            <BackLink />
          </div>
        </>
      ) : flow ? (
        <FlowView flow={flow} deviceId={deviceId} />
      ) : (
        <p className="type-body" role="status">
          {t("loading")}
        </p>
      )}
    </section>
  );
}

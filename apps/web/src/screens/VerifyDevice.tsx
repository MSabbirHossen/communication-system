import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Link, useParams } from "react-router";
import { t } from "../i18n";
import { toAuthError, type AuthError } from "../matrix/errors";
import type { VerificationFlow } from "../matrix/verification";
import type { MatrixClient } from "../matrix/client";
import { useSession } from "../session/SessionProvider";
import { useSecurity, type SecurityStore } from "../session/security";
import { useConversations } from "../session/useRooms";
import { authErrorMessage } from "./auth";

function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="button">
      {label}
    </Link>
  );
}

/**
 * Renders one verification flow (APP_FLOW 5.4). The initiator starts the emoji
 * comparison once both sides are ready; the accepting side waits for it. Every outcome
 * other than the SDK's "done" keeps the subject unverified and says so.
 */
function FlowView({
  flow,
  subject,
  backTo,
  backLabel,
  self,
}: {
  flow: VerificationFlow;
  subject: string;
  backTo: string;
  backLabel: string;
  /** Verifying one of my own devices (true) or another person (false). */
  self: boolean;
}) {
  const state = useSyncExternalStore(flow.subscribe, flow.getState, flow.getState);
  const [actionError, setActionError] = useState<AuthError | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (state.phase === "ready" && state.initiatedByMe) {
      flow.startSas().catch((e: unknown) => setActionError(toAuthError(e)));
    }
  }, [flow, state.phase, state.initiatedByMe]);

  // Leaving the screen mid-flow cancels it (the subject stays unverified). The cancel is
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
  const incomingBody = self ? t("verify.incoming.body") : t("verify.incoming.user.body");
  const doneBody = self ? t("verify.done.body") : t("verify.done.user.body");

  let body: React.ReactNode;
  switch (state.phase) {
    case "requested":
      body = state.initiatedByMe ? (
        <>
          <p className="type-body" role="status">
            {self ? t("verify.waiting.accept") : t("verify.waiting.accept.user")}
          </p>
          <div className="actions">
            <button type="button" className="button" onClick={() => void run(flow.cancel())}>
              {t("verify.cancel")}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="type-body">{incomingBody}</p>
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
            {doneBody}
          </p>
          <div className="actions">
            <BackLink to={backTo} label={backLabel} />
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
            <span className="badge badge--warn">
              {self ? t("devices.badge.unverified") : t("security.identity.unverified")}
            </span>{" "}
            <code>{subject}</code>
          </p>
          <div className="actions">
            <BackLink to={backTo} label={backLabel} />
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

/** Shared screen: resolves a pending incoming flow or starts a new request, then renders it. */
function VerifyFlowScreen({
  title,
  subject,
  self,
  backTo,
  backLabel,
  pending,
  request,
}: {
  title: string;
  subject: string;
  self: boolean;
  backTo: string;
  backLabel: string;
  pending: (store: SecurityStore) => VerificationFlow | undefined;
  request: (store: SecurityStore, client: MatrixClient) => Promise<VerificationFlow>;
}) {
  const { client } = useSession();
  const security = useSecurity();
  const [flow, setFlow] = useState<VerificationFlow | null>(() => pending(security) ?? null);
  const [error, setError] = useState<AuthError | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (flow || !client || !subject || started.current) return;
    started.current = true;
    request(security, client).then(
      (f) => setFlow(f),
      (e: unknown) => setError(toAuthError(e)),
    );
  }, [client, subject, flow, security, request]);

  return (
    <section className="pane" aria-labelledby="verify-title">
      <h1 id="verify-title" className="type-heading pane__title">
        {title}
      </h1>
      <p className="type-meta text-muted">
        {self ? t("verify.deviceLabel") : t("verify.userLabel")} <code>{subject}</code>
      </p>
      {error ? (
        <>
          <p className="banner banner--danger" role="alert">
            {authErrorMessage(error)}
          </p>
          <div className="actions">
            <BackLink to={backTo} label={backLabel} />
          </div>
        </>
      ) : flow ? (
        <FlowView flow={flow} subject={subject} backTo={backTo} backLabel={backLabel} self={self} />
      ) : (
        <p className="type-body" role="status">
          {t("loading")}
        </p>
      )}
    </section>
  );
}

/** /settings/devices/verify/:deviceId — verify one of my own devices. */
export function VerifyDeviceScreen() {
  const { deviceId = "" } = useParams();
  return (
    <VerifyFlowScreen
      title={t("verify.title")}
      subject={deviceId}
      self
      backTo="/settings/devices"
      backLabel={t("verify.back")}
      pending={(store) => store.incomingFor(deviceId)}
      request={(store, client) => store.requestVerification(client, deviceId)}
    />
  );
}

/** /chats/:roomId/verify — verify the other participant of a direct conversation. */
export function VerifyUserScreen() {
  const { roomId = "" } = useParams();
  const conversation = useConversations().find((c) => c.roomId === roomId);
  const userId = conversation?.otherUserId ?? "";
  const backTo = `/chats/${encodeURIComponent(roomId)}/details`;
  if (!conversation) {
    return (
      <div className="empty" role="alert">
        <h2 className="type-heading">{t("chat.notFound.title")}</h2>
        <Link to="/chats" className="link">
          {t("notFound.back")}
        </Link>
      </div>
    );
  }
  return (
    <VerifyFlowScreen
      title={t("verify.user.title", { name: conversation.displayName })}
      subject={userId}
      self={false}
      backTo={backTo}
      backLabel={t("verify.back.details")}
      pending={(store) => store.incomingUserFor(userId)}
      request={(store, client) => store.requestUserVerification(client, userId, roomId)}
    />
  );
}

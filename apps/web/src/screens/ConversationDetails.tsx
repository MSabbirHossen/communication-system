import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ConfirmDialog } from "../components/dialogs";
import { t, type MessageKey } from "../i18n";
import { toAuthError, type AuthError } from "../matrix/errors";
import type { RecipientSecurity } from "../matrix/recipientSecurity";
import { useSession } from "../session/SessionProvider";
import { useRecipientSecurity } from "../session/useRecipientSecurity";
import { useConversations } from "../session/useRooms";
import { authErrorMessage } from "./auth";

/** Identity badge text and tone, from SDK state only. */
export function identityBadge(s: RecipientSecurity | null): { label: string; cls: string } {
  switch (s?.identity) {
    case "verified":
      return { label: t("security.identity.verified"), cls: "badge badge--ok" };
    case "changed":
      return { label: t("security.identity.changed"), cls: "badge badge--warn" };
    case "unverified":
      return { label: t("security.identity.unverified"), cls: "badge badge--warn" };
    default:
      return { label: t("devices.badge.unknown"), cls: "badge" };
  }
}

/**
 * Who you are talking to and what the encryption state means (UI brief §6.7): an
 * encrypted conversation is not the same as a verified identity, and every label here
 * comes from the SDK's verification state.
 */
export function ConversationDetailsScreen() {
  const { roomId = "" } = useParams();
  const { client } = useSession();
  const navigate = useNavigate();
  const conversation = useConversations().find((c) => c.roomId === roomId);
  const security = useRecipientSecurity(conversation?.otherUserId);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AuthError | null>(null);

  if (!client || !conversation) {
    return (
      <div className="empty" role="alert">
        <h2 className="type-heading">{t("chat.notFound.title")}</h2>
        <Link to="/chats" className="link">
          {t("notFound.back")}
        </Link>
      </div>
    );
  }

  const back = `/chats/${encodeURIComponent(roomId)}`;
  const badge = identityBadge(security);

  async function leave() {
    if (!client) return;
    setConfirmLeave(false);
    setBusy(true);
    try {
      await client.leave(roomId);
      navigate("/chats");
    } catch (e) {
      setError(toAuthError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="details">
      <header className="chat__header">
        <Link to={back} className="button button--inline" aria-label={t("nav.back")}>
          ←
        </Link>
        <div className="chat__who">
          <h1 className="type-heading chat__name">{t("details.title")}</h1>
        </div>
      </header>

      {error && (
        <p className="banner banner--danger" role="alert">
          {authErrorMessage(error)}
        </p>
      )}

      <section className="card" aria-labelledby="details-identity">
        <h2 id="details-identity" className="type-body field__label">
          {t("details.identity")}
        </h2>
        <p className="type-body">
          <strong>{conversation.displayName}</strong>{" "}
          <span className={badge.cls}>{badge.label}</span>
        </p>
        <p className="type-meta">
          <code>{conversation.otherUserId}</code>
        </p>
        <p className="type-meta text-muted">
          {t(`security.identity.${security?.identity ?? "unknown"}.help` as MessageKey)}
        </p>
        {security && security.identity !== "verified" && security.identity !== "unknown" && (
          <div className="actions actions--start">
            <Link
              to={`/chats/${encodeURIComponent(roomId)}/verify`}
              className="button button--primary"
            >
              {t("details.verify")}
            </Link>
          </div>
        )}
      </section>

      <section className="card" aria-labelledby="details-encryption">
        <h2 id="details-encryption" className="type-body field__label">
          {t("details.encryption")}
        </h2>
        <p className="type-body">
          {conversation.encrypted ? (
            <span className="badge badge--ok">{t("chat.encrypted")}</span>
          ) : (
            <span className="badge badge--warn">{t("chat.notEncrypted")}</span>
          )}
        </p>
        <p className="type-meta text-muted">
          {conversation.encrypted ? t("details.encryption.help") : t("chat.encryptionRequired")}
        </p>
      </section>

      <section className="card" aria-labelledby="details-devices">
        <h2 id="details-devices" className="type-body field__label">
          {t("details.devices")}
        </h2>
        {security === null ? (
          <p className="type-body" role="status">
            {t("loading")}
          </p>
        ) : security.devices.length === 0 ? (
          <p className="type-meta text-muted">{t("details.devices.none")}</p>
        ) : (
          <ul className="device-list" aria-label={t("details.devices")}>
            {security.devices.map((d) => (
              <li key={d.id} className="device">
                <div className="device__main">
                  <p className="type-body device__name">{d.name ?? t("devices.unnamed")}</p>
                  <p className="type-meta text-muted">
                    <code>{d.id}</code>
                  </p>
                  {d.fingerprint && (
                    <p className="type-meta text-muted">
                      {t("devices.identity.fingerprint")} <code>{d.fingerprint}</code>
                    </p>
                  )}
                </div>
                <div className="device__side">
                  <span className={d.verified ? "badge badge--ok" : "badge badge--warn"}>
                    {d.verified ? t("devices.badge.verified") : t("devices.badge.unverified")}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="type-meta text-muted">{t("details.devices.help")}</p>
      </section>

      <div className="actions actions--start">
        <button
          type="button"
          className="button button--danger"
          disabled={busy}
          onClick={() => setConfirmLeave(true)}
        >
          {t("details.leave")}
        </button>
      </div>

      {confirmLeave && (
        <ConfirmDialog
          title={t("details.leave.title")}
          body={t("details.leave.body")}
          confirmLabel={t("details.leave")}
          destructive
          onConfirm={() => void leave()}
          onCancel={() => setConfirmLeave(false)}
        />
      )}
    </div>
  );
}

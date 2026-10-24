import { useState } from "react";
import { Link } from "react-router";
import { ConfirmDialog } from "../components/dialogs";
import { t } from "../i18n";
import { toAuthError, type AuthError } from "../matrix/errors";
import { useBlockedUsers } from "../session/useBlocking";
import { authErrorMessage } from "./auth";

/** Blocked users (UI brief §6.9): who is ignored, with an explicit way back. */
export function BlockedUsersScreen() {
  const { blocked, unblock } = useBlockedUsers();
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AuthError | null>(null);

  async function doUnblock(userId: string) {
    setConfirm(null);
    setBusy(true);
    setError(null);
    try {
      await unblock(userId);
    } catch (e) {
      setError(toAuthError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="pane" aria-labelledby="blocked-title">
      <h1 id="blocked-title" className="type-heading pane__title">
        {t("blocked.title")}
      </h1>
      <p className="type-body text-muted">{t("blocked.intro")}</p>
      {error && (
        <p className="banner banner--danger" role="alert">
          {authErrorMessage(error)}
        </p>
      )}
      {blocked.length === 0 ? (
        <div className="empty">
          <h2 className="type-heading">{t("blocked.empty.title")}</h2>
          <p className="type-body text-muted">{t("blocked.empty.body")}</p>
        </div>
      ) : (
        <ul className="device-list" aria-label={t("blocked.list")}>
          {blocked.map((userId) => (
            <li key={userId} className="device">
              <div className="device__main">
                <p className="type-body">
                  <code>{userId}</code>
                </p>
              </div>
              <div className="device__side">
                <button
                  type="button"
                  className="button button--inline"
                  disabled={busy}
                  onClick={() => setConfirm(userId)}
                >
                  {t("blocked.unblock")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="actions actions--start">
        <Link to="/settings" className="button">
          {t("nav.back")}
        </Link>
      </div>
      {confirm && (
        <ConfirmDialog
          title={t("blocked.unblock.title")}
          body={t("blocked.unblock.body")}
          confirmLabel={t("blocked.unblock")}
          onConfirm={() => void doUnblock(confirm)}
          onCancel={() => setConfirm(null)}
        />
      )}
    </section>
  );
}

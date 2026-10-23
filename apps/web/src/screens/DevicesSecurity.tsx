import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { ConfirmDialog, PasswordPrompt } from "../components/dialogs";
import { t } from "../i18n";
import {
  getOwnIdentity,
  listOwnDevices,
  renameDevice,
  revokeDevice,
  type DeviceSummary,
  type OwnIdentity,
} from "../matrix/devices";
import { toAuthError, type AuthError } from "../matrix/errors";
import { UiaCancelled } from "../matrix/uia";
import { useSession, useSessionController } from "../session/SessionProvider";
import { authErrorMessage } from "./auth";

function formatLastSeen(ts: number | undefined): string {
  if (!ts) return t("devices.lastSeen.unknown");
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(ts),
  );
}

function VerificationBadge({ device }: { device: DeviceSummary }) {
  const label = !device.hasKeys
    ? t("devices.badge.noKeys")
    : device.verification === "verified"
      ? t("devices.badge.verified")
      : device.verification === "unverified"
        ? t("devices.badge.unverified")
        : t("devices.badge.unknown");
  const cls =
    device.verification === "verified"
      ? "badge badge--ok"
      : device.verification === "unverified"
        ? "badge badge--warn"
        : "badge";
  return <span className={cls}>{label}</span>;
}

type LoadResult = { list: DeviceSummary[]; me: OwnIdentity } | { error: AuthError };

async function loadDevicesAndIdentity(
  client: NonNullable<ReturnType<typeof useSession>["client"]>,
): Promise<LoadResult> {
  try {
    const [list, me] = await Promise.all([listOwnDevices(client), getOwnIdentity(client)]);
    return { list, me };
  } catch (e) {
    return { error: toAuthError(e) };
  }
}

export function DevicesSecurityScreen() {
  const controller = useSessionController();
  const { client } = useSession();
  const [devices, setDevices] = useState<DeviceSummary[] | null>(null);
  const [identity, setIdentity] = useState<OwnIdentity | null>(null);
  const [error, setError] = useState<AuthError | null>(null);
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<DeviceSummary | null>(null);
  const [passwordRequest, setPasswordRequest] = useState<{
    resolve: (pw: string) => void;
    reject: (e: Error) => void;
  } | null>(null);

  // Data loading runs outside the component; state is set from the promise callback.
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    void loadDevicesAndIdentity(client).then((r) => {
      if (cancelled) return;
      if ("error" in r) {
        setError(r.error);
        setDevices([]);
      } else {
        setDevices(r.list);
        setIdentity(r.me);
        setError(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [client, version]);

  const requestPassword = useCallback(
    () =>
      new Promise<string>((resolve, reject) => {
        setPasswordRequest({ resolve, reject });
      }),
    [],
  );

  async function doRevoke(device: DeviceSummary) {
    if (!client) return;
    setConfirmRevoke(null);
    setBusy(true);
    setError(null);
    try {
      await revokeDevice(client, device.id, requestPassword);
      reload();
    } catch (e) {
      if (!(e instanceof UiaCancelled)) setError(toAuthError(e));
    } finally {
      setPasswordRequest(null);
      setBusy(false);
    }
  }

  async function saveRename() {
    if (!client || !renaming) return;
    setBusy(true);
    try {
      await renameDevice(client, renaming.id, renaming.name);
      setRenaming(null);
      reload();
    } catch (e) {
      setError(toAuthError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="pane" aria-labelledby="devices-title">
      <h1 id="devices-title" className="type-heading pane__title">
        {t("devices.title")}
      </h1>
      <p className="type-body text-muted">{t("devices.intro")}</p>

      {identity && (
        <div className="card" aria-label={t("devices.identity.title")}>
          <h2 className="type-body field__label">{t("devices.identity.title")}</h2>
          <p className="type-meta">
            {t("devices.identity.user")} <code>{identity.userId}</code>
          </p>
          <p className="type-meta">
            {t("devices.identity.device")} <code>{identity.deviceId}</code>
          </p>
          <p className="type-meta">
            {t("devices.identity.fingerprint")}{" "}
            <code>{identity.fingerprint ?? t("devices.lastSeen.unknown")}</code>
          </p>
          <p className="type-meta text-muted">{t("devices.identity.help")}</p>
        </div>
      )}

      {error && (
        <p className="banner banner--danger" role="alert">
          {authErrorMessage(error)}
        </p>
      )}

      {devices === null ? (
        <p className="type-body" role="status">
          {t("loading")}
        </p>
      ) : devices.length === 0 ? (
        <p className="type-body text-muted">{t("devices.empty")}</p>
      ) : (
        <ul className="device-list" aria-label={t("devices.list")}>
          {devices.map((d) => (
            <li key={d.id} className={`device${d.isCurrent ? " device--current" : ""}`}>
              <div className="device__main">
                {renaming?.id === d.id ? (
                  <form
                    className="device__rename"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void saveRename();
                    }}
                  >
                    <input
                      className="input"
                      aria-label={t("devices.rename.label")}
                      value={renaming.name}
                      maxLength={100}
                      onChange={(e) => setRenaming({ id: d.id, name: e.target.value })}
                    />
                    <button type="submit" className="button button--inline" disabled={busy}>
                      {t("devices.rename.save")}
                    </button>
                    <button
                      type="button"
                      className="button button--inline"
                      onClick={() => setRenaming(null)}
                    >
                      {t("dialog.cancel")}
                    </button>
                  </form>
                ) : (
                  <p className="type-body device__name">
                    {d.name ?? t("devices.unnamed")}{" "}
                    {d.isCurrent && <span className="badge">{t("devices.current")}</span>}
                  </p>
                )}
                <p className="type-meta text-muted">
                  <code>{d.id}</code> · {t("devices.lastSeen")} {formatLastSeen(d.lastSeenTs)}
                </p>
                {d.fingerprint && (
                  <p className="type-meta text-muted">
                    {t("devices.identity.fingerprint")} <code>{d.fingerprint}</code>
                  </p>
                )}
              </div>
              <div className="device__side">
                <VerificationBadge device={d} />
                <div className="device__actions">
                  {d.hasKeys && d.verification === "unverified" && !d.isCurrent && (
                    <Link
                      to={`/settings/devices/verify/${encodeURIComponent(d.id)}`}
                      className="button button--inline"
                    >
                      {t("devices.verify")}
                    </Link>
                  )}
                  {!renaming && (
                    <button
                      type="button"
                      className="button button--inline"
                      disabled={busy}
                      onClick={() => setRenaming({ id: d.id, name: d.name ?? "" })}
                    >
                      {t("devices.rename")}
                    </button>
                  )}
                  {d.isCurrent ? (
                    <button
                      type="button"
                      className="button button--inline"
                      disabled={busy}
                      onClick={() => void controller.signOut()}
                    >
                      {t("settings.signOut")}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="button button--inline button--danger"
                      disabled={busy}
                      onClick={() => setConfirmRevoke(d)}
                    >
                      {t("devices.revoke")}
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="actions">
        <button type="button" className="button" disabled={busy} onClick={reload}>
          {t("devices.refresh")}
        </button>
      </div>

      {confirmRevoke && (
        <ConfirmDialog
          title={t("devices.revoke.title")}
          body={t("devices.revoke.body")}
          confirmLabel={t("devices.revoke.confirm")}
          destructive
          onConfirm={() => void doRevoke(confirmRevoke)}
          onCancel={() => setConfirmRevoke(null)}
        />
      )}
      {passwordRequest && (
        <PasswordPrompt
          title={t("devices.reauth.title")}
          explanation={t("devices.reauth.body")}
          onSubmit={(pw) => {
            passwordRequest.resolve(pw);
            setPasswordRequest(null);
          }}
          onCancel={() => {
            passwordRequest.reject(new UiaCancelled());
            setPasswordRequest(null);
          }}
        />
      )}
    </section>
  );
}

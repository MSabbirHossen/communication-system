import { useState } from "react";
import { Link } from "react-router";
import { Switch } from "../components/Switch";
import { t } from "../i18n";
import { toAuthError, type AuthError } from "../matrix/errors";
import type { NotificationPreview, UserSettings } from "../matrix/settings";
import {
  notificationPermission,
  requestNotificationPermission,
  type NotificationPermissionState,
} from "../session/notifications";
import { useUserSettings } from "../session/useSettings";
import { isNativePlatform } from "../platform/native";
import { authErrorMessage } from "./auth";

const PREVIEWS: NotificationPreview[] = ["off", "generic", "sender"];

/**
 * Privacy & notifications (UI brief §6.9). Each control says what it changes and what the
 * server can still see; product-level controls are kept apart from the browser's own
 * notification permission.
 */
export function PrivacySettingsScreen() {
  const { settings, update } = useUserSettings();
  const [error, setError] = useState<AuthError | null>(null);
  const [busy, setBusy] = useState(false);
  const [permission, setPermission] = useState<NotificationPermissionState>(() =>
    notificationPermission(),
  );

  const allowNotifications = () => {
    void requestNotificationPermission().then(setPermission);
  };

  const change = (patch: Partial<UserSettings>) => {
    setError(null);
    setBusy(true);
    update(patch)
      .catch((e: unknown) => setError(toAuthError(e)))
      .finally(() => setBusy(false));
  };

  return (
    <section className="pane" aria-labelledby="privacy-settings-title">
      <h1 id="privacy-settings-title" className="type-heading pane__title">
        {t("settings.privacy")}
      </h1>
      <p className="type-body text-muted">{t("privacySettings.intro")}</p>
      {error && (
        <p className="banner banner--danger" role="alert">
          {authErrorMessage(error)}
        </p>
      )}

      <section className="card" aria-labelledby="privacy-sharing">
        <h2 id="privacy-sharing" className="type-body field__label">
          {t("privacySettings.sharing")}
        </h2>
        <Switch
          label={t("privacySettings.receipts")}
          description={t("privacySettings.receipts.help")}
          checked={settings.shareReadReceipts}
          disabled={busy}
          onChange={(v) => change({ shareReadReceipts: v })}
        />
        <Switch
          label={t("privacySettings.presence")}
          description={t("privacySettings.presence.help")}
          checked={settings.sharePresence}
          disabled={busy}
          onChange={(v) => change({ sharePresence: v })}
        />
      </section>

      <section className="card" aria-labelledby="privacy-notifications">
        <h2 id="privacy-notifications" className="type-body field__label">
          {t("privacySettings.notifications")}
        </h2>
        <fieldset className="field">
          <legend className="type-body">{t("privacySettings.preview")}</legend>
          {PREVIEWS.map((p) => (
            <label key={p} className="radio">
              <input
                type="radio"
                name="notificationPreview"
                value={p}
                checked={settings.notificationPreview === p}
                disabled={busy}
                onChange={() => change({ notificationPreview: p })}
              />
              {t(`privacySettings.preview.${p}`)}
            </label>
          ))}
          <p className="type-meta text-muted">{t("privacySettings.preview.help")}</p>
        </fieldset>
        <div className="field">
          <p className="type-body">
            {t("notifications.permission")}{" "}
            <span className="text-muted" data-testid="notification-permission">
              {t(`notifications.permission.${permission}`)}
            </span>
          </p>
          <p className="type-meta text-muted">{t("notifications.permission.help")}</p>
          {isNativePlatform() && (
            <p className="type-meta text-muted">{t("notifications.push.pending")}</p>
          )}
          {permission === "default" && settings.notificationPreview !== "off" && (
            <div className="actions actions--start">
              <button type="button" className="button" onClick={allowNotifications}>
                {t("notifications.allow")}
              </button>
            </div>
          )}
        </div>
      </section>

      <p className="type-meta text-muted">{t("privacySettings.serverNote")}</p>
      <div className="actions actions--start">
        <Link to="/settings" className="button">
          {t("nav.back")}
        </Link>
      </div>
    </section>
  );
}

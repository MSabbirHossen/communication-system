import { Link } from "react-router";
import { t, type Locale, LOCALES, getLocale, setLocale } from "../i18n";
import { useTheme, type ThemePreference } from "../shell/ThemeProvider";
import { useSession, useSessionController } from "../session/SessionProvider";

function SettingsRow({ to, title, body }: { to: string; title: string; body: string }) {
  return (
    <li className="settings-row">
      <Link to={to} className="settings-row__link">
        <span className="type-body settings-row__title">{title}</span>
        <span className="type-meta text-muted">{body}</span>
      </Link>
    </li>
  );
}

/** Settings hub (UI brief §6.9, §6.10): one entry point per area, sign-out kept apart from account changes. */
export function SettingsScreen() {
  const { preference, setPreference } = useTheme();
  const controller = useSessionController();
  const { session } = useSession();
  const options: ThemePreference[] = ["system", "light", "dark"];
  return (
    <section className="pane" aria-labelledby="settings-title">
      <h1 id="settings-title" className="type-heading pane__title">
        {t("settings.title")}
      </h1>
      {session && (
        <p className="type-meta text-muted">
          {t("settings.signedInAs")} <code>{session.userId}</code>
        </p>
      )}
      <ul className="settings-list" aria-label={t("settings.sections")}>
        <SettingsRow
          to="/settings/profile"
          title={t("settings.profile")}
          body={t("settings.profile.body")}
        />
        <SettingsRow
          to="/settings/privacy"
          title={t("settings.privacy")}
          body={t("settings.privacy.body")}
        />
        <SettingsRow
          to="/settings/blocked"
          title={t("settings.blocked")}
          body={t("settings.blocked.body")}
        />
        <SettingsRow
          to="/settings/devices"
          title={t("settings.devices")}
          body={t("settings.devices.body")}
        />
        <SettingsRow
          to="/privacy"
          title={t("privacy.title")}
          body={t("settings.privacyNotes.body")}
        />
      </ul>

      <fieldset className="field">
        <legend className="type-body">{t("settings.theme")}</legend>
        {options.map((o) => (
          <label key={o} className="radio">
            <input
              type="radio"
              name="theme"
              value={o}
              checked={preference === o}
              onChange={() => setPreference(o)}
            />
            {t(`settings.theme.${o}` as const)}
          </label>
        ))}
      </fieldset>
      <div className="field">
        <label htmlFor="locale" className="type-body">
          {t("settings.language")}
        </label>
        <select
          id="locale"
          defaultValue={getLocale()}
          onChange={(e) => setLocale(e.target.value as Locale)}
        >
          {(Object.keys(LOCALES) as Locale[]).map((l) => (
            <option key={l} value={l}>
              {LOCALES[l].label}
            </option>
          ))}
        </select>
        <p className="type-meta text-muted">{t("settings.language.note")}</p>
      </div>

      <div className="actions actions--start">
        <button type="button" className="button" onClick={() => void controller.signOut()}>
          {t("settings.signOut")}
        </button>
      </div>
    </section>
  );
}

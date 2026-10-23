import { Link, useRouteError } from "react-router";
import { t, type Locale, LOCALES, getLocale, setLocale } from "../i18n";
import { useTheme, type ThemePreference } from "../shell/ThemeProvider";
import { useSession, useSessionController } from "../session/SessionProvider";

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty">
      <h2 className="type-heading">{title}</h2>
      <p className="type-body text-muted">{body}</p>
    </div>
  );
}

export function WelcomeScreen() {
  return (
    <section className="screen screen--centered" aria-labelledby="welcome-title">
      <h1 id="welcome-title" className="type-title">
        {t("welcome.title")}
      </h1>
      <p className="type-body">{t("welcome.body")}</p>
      <div className="actions">
        <Link to="/register" className="button button--primary">
          {t("welcome.create")}
        </Link>
        <Link to="/login" className="button">
          {t("welcome.signIn")}
        </Link>
      </div>
      <Link to="/privacy" className="link">
        {t("welcome.privacy")}
      </Link>
    </section>
  );
}

export function PeopleScreen() {
  return (
    <section className="pane" aria-label={t("nav.people")}>
      <h1 className="type-heading pane__title">{t("nav.people")}</h1>
      <EmptyState title={t("people.empty.title")} body={t("people.empty.body")} />
    </section>
  );
}

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
        <div className="field">
          <p className="type-body">
            {t("settings.signedInAs")} <code>{session.userId}</code>
          </p>
          <div className="actions actions--start">
            <Link to="/settings/devices" className="button">
              {t("settings.devices")}
            </Link>
            <button
              type="button"
              className="button"
              onClick={() => {
                void controller.signOut();
              }}
            >
              {t("settings.signOut")}
            </button>
          </div>
        </div>
      )}
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
      </div>
    </section>
  );
}

export function NotFoundScreen() {
  return (
    <section className="screen screen--centered" role="alert">
      <h1 className="type-title">{t("notFound.title")}</h1>
      <Link to="/chats" className="link">
        {t("notFound.back")}
      </Link>
    </section>
  );
}

/** Router-level error element: shown when a route loader/render throws. */
export function RouteErrorScreen() {
  useRouteError();
  return (
    <section className="screen screen--centered" role="alert">
      <h1 className="type-title">{t("error.title")}</h1>
      <p className="type-body">{t("error.body")}</p>
      <Link to="/chats" className="link">
        {t("notFound.back")}
      </Link>
    </section>
  );
}

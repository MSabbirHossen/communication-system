import { Link, useRouteError } from "react-router";
import { t } from "../i18n";

export function WelcomeScreen() {
  return (
    <section className="screen screen--centered" aria-labelledby="welcome-title">
      <p className="type-meta text-muted">{t("app.name")}</p>
      <h1 id="welcome-title" className="type-title">
        {t("welcome.title")}
      </h1>
      <p className="type-body">{t("welcome.body")}</p>
      <ul className="welcome__points type-body">
        <li>{t("welcome.points.encrypted")}</li>
        <li>{t("welcome.points.devices")}</li>
        <li>{t("welcome.points.private")}</li>
      </ul>
      <div className="actions">
        <Link to="/register" className="button button--primary">
          {t("welcome.create")}
        </Link>
        <Link to="/login" className="button">
          {t("welcome.signIn")}
        </Link>
      </div>
      <p className="type-meta welcome__links">
        <Link to="/privacy" className="link">
          {t("welcome.privacy")}
        </Link>
        {" · "}
        <Link to="/terms" className="link">
          {t("welcome.terms")}
        </Link>
      </p>
    </section>
  );
}

/** Placeholder until the closed-beta terms exist (Phase 8). */
export function TermsScreen() {
  return (
    <section className="screen screen--centered" aria-labelledby="terms-title">
      <h1 id="terms-title" className="type-title">
        {t("terms.title")}
      </h1>
      <p className="type-body">{t("terms.body")}</p>
      <Link to="/" className="link">
        {t("nav.back")}
      </Link>
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

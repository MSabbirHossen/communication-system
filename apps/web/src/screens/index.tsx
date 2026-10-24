import { Link, useRouteError } from "react-router";
import { t } from "../i18n";

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

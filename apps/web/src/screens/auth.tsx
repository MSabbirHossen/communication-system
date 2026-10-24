import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { TextField } from "../components/TextField";
import { t, type MessageKey } from "../i18n";
import { validatePassword, validateUsername, type FieldError } from "../matrix/auth";
import type { AuthError } from "../matrix/errors";
import { useSession, useSessionController } from "../session/SessionProvider";

function fieldMessage(e: FieldError | null): string | null {
  if (!e) return null;
  return t(`auth.field.${e}` as MessageKey);
}

/** User-safe text for an AuthError; never echoes input or server text. */
export function authErrorMessage(error: AuthError): string {
  if (error.code === "rate_limited" && error.retryAfterMs) {
    return t("auth.error.rate_limited_after", {
      seconds: Math.max(1, Math.ceil(error.retryAfterMs / 1000)),
    });
  }
  return t(`auth.error.${error.code}` as MessageKey);
}

function AuthForm({ mode }: { mode: "login" | "register" }) {
  const controller = useSessionController();
  const { status, error } = useSession();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState(false);
  const busy = status === "authenticating" || status === "starting";

  const usernameError = touched ? fieldMessage(validateUsername(username.trim())) : null;
  const passwordError = touched ? fieldMessage(validatePassword(password)) : null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (validateUsername(username.trim()) || validatePassword(password)) return;
    const creds = { username: username.trim(), password };
    if (mode === "login") await controller.signIn(creds);
    else await controller.signUp(creds);
    const after = controller.getSnapshot();
    if (after.status === "ready") navigate("/chats", { replace: true });
  }

  const title = mode === "login" ? t("auth.login.title") : t("auth.register.title");
  return (
    <main className="screen screen--centered" aria-labelledby="auth-title">
      <h1 id="auth-title" className="type-title">
        {title}
      </h1>
      <p className="type-body text-muted">{t("auth.subtitle")}</p>
      <form onSubmit={onSubmit} noValidate aria-busy={busy}>
        <TextField
          label={t("auth.username")}
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            controller.clearError();
          }}
          error={usernameError}
          hint={mode === "register" ? t("auth.username.hint") : undefined}
          disabled={busy}
        />
        <TextField
          label={t("auth.password")}
          type="password"
          name="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            controller.clearError();
          }}
          error={passwordError}
          hint={mode === "register" ? t("auth.password.hint") : undefined}
          disabled={busy}
        />
        {error && (
          <p className="banner banner--danger" role="alert">
            {authErrorMessage(error)}
          </p>
        )}
        <div className="actions">
          <button type="submit" className="button button--primary" disabled={busy}>
            {busy
              ? t("auth.working")
              : mode === "login"
                ? t("auth.login.submit")
                : t("auth.register.submit")}
          </button>
        </div>
      </form>
      <p className="type-meta text-muted">
        {mode === "login" ? (
          <>
            {t("auth.login.noAccount")} <Link to="/register">{t("auth.register.link")}</Link>
          </>
        ) : (
          <>
            {t("auth.register.haveAccount")} <Link to="/login">{t("auth.login.link")}</Link>
          </>
        )}
      </p>
      <details className="type-meta text-muted">
        <summary>{t("auth.recovery.summary")}</summary>
        <p>{t("auth.recovery.body")}</p>
      </details>
      <p className="type-meta text-muted">
        <Link to="/privacy">{t("welcome.privacy")}</Link>
      </p>
    </main>
  );
}

export const LoginScreen = () => <AuthForm mode="login" />;
export const RegisterScreen = () => <AuthForm mode="register" />;

/** Static privacy notes placeholder until the real disclosure is written (Phase 8). */
export function PrivacyScreen() {
  return (
    <main className="screen screen--centered" aria-labelledby="privacy-title">
      <h1 id="privacy-title" className="type-title">
        {t("privacy.title")}
      </h1>
      <p className="type-body">{t("privacy.e2ee")}</p>
      <p className="type-body">{t("privacy.metadata")}</p>
      <p className="type-body">{t("privacy.webKeys")}</p>
      <p className="type-body">{t("privacy.recovery")}</p>
      <Link to="/" className="link">
        {t("nav.back")}
      </Link>
    </main>
  );
}

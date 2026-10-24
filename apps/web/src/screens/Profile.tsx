import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { TextField } from "../components/TextField";
import { t } from "../i18n";
import { toAuthError, type AuthError } from "../matrix/errors";
import {
  DISPLAY_NAME_MAX_LENGTH,
  getOwnProfile,
  setDisplayName,
  validateDisplayName,
  type OwnProfile,
} from "../matrix/profile";
import { useSession } from "../session/SessionProvider";
import { authErrorMessage } from "./auth";

/** Profile (UI brief §6.5/§6.10): the display name is editable, the identifier is not. */
export function ProfileScreen() {
  const { client } = useSession();
  const [profile, setProfile] = useState<OwnProfile | null>(null);
  const [name, setName] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<AuthError | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    getOwnProfile(client).then(
      (p) => {
        if (cancelled) return;
        setProfile(p);
        setName(p.displayName ?? "");
      },
      (e: unknown) => {
        if (!cancelled) setError(toAuthError(e));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [client]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!client) return;
    const invalid = validateDisplayName(name);
    if (invalid) {
      setFieldError(t(`profile.field.${invalid}`, { max: DISPLAY_NAME_MAX_LENGTH }));
      return;
    }
    setFieldError(null);
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      const applied = await setDisplayName(client, name);
      setName(applied);
      setProfile((p) => (p ? { ...p, displayName: applied } : p));
      setSaved(true);
    } catch (err) {
      setError(toAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  const unchanged = profile !== null && name.trim() === (profile.displayName ?? "");

  return (
    <section className="pane" aria-labelledby="profile-title">
      <h1 id="profile-title" className="type-heading pane__title">
        {t("profile.title")}
      </h1>
      {profile === null && !error ? (
        <p className="type-body" role="status">
          {t("loading")}
        </p>
      ) : (
        <form onSubmit={(e) => void save(e)} noValidate>
          <div className="field">
            <span className="type-body field__label">{t("profile.identifier")}</span>
            <code>{profile?.userId ?? client?.getUserId()}</code>
            <p className="type-meta text-muted">{t("profile.identifier.note")}</p>
          </div>
          <TextField
            label={t("profile.displayName")}
            name="displayName"
            autoComplete="nickname"
            maxLength={DISPLAY_NAME_MAX_LENGTH}
            hint={t("profile.displayName.hint")}
            error={fieldError}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setSaved(false);
            }}
          />
          {error && (
            <p className="banner banner--danger" role="alert">
              {authErrorMessage(error)}
            </p>
          )}
          {saved && (
            <p className="banner banner--ok" role="status">
              {t("profile.saved")}
            </p>
          )}
          <div className="actions actions--start">
            <button type="submit" className="button button--primary" disabled={busy || unchanged}>
              {busy ? t("auth.working") : t("profile.save")}
            </button>
            <Link to="/settings" className="button">
              {t("nav.back")}
            </Link>
          </div>
        </form>
      )}
    </section>
  );
}

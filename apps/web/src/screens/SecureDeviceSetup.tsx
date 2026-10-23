import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { TextField } from "../components/TextField";
import { t, type MessageKey } from "../i18n";
import type { SetupStep } from "../matrix/cryptoSetup";
import { useSession, useSessionController } from "../session/SessionProvider";
import { authErrorMessage } from "./auth";

const STEPS: SetupStep[] = ["checking", "cross_signing", "secret_storage", "key_backup"];

function Steps({ current }: { current: SetupStep }) {
  const idx = STEPS.indexOf(current === "restoring" ? "secret_storage" : current);
  return (
    <ol className="steps" aria-label={t("setup.progress")}>
      {STEPS.map((s, i) => (
        <li
          key={s}
          className={i < idx ? "step step--done" : i === idx ? "step step--current" : "step"}
        >
          {t(`setup.step.${s}` as MessageKey)}
        </li>
      ))}
    </ol>
  );
}

function PasswordStep() {
  const controller = useSessionController();
  const { setup } = useSession();
  const [password, setPassword] = useState("");
  const error = setup.phase === "need_password" ? setup.error : null;
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!password) return;
    controller.submitSetupPassword(password);
    setPassword("");
  }
  return (
    <form onSubmit={submit} noValidate>
      <p className="type-body">{t("setup.password.why")}</p>
      <TextField
        label={t("auth.password")}
        type="password"
        name="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {error && (
        <p className="banner banner--danger" role="alert">
          {authErrorMessage(error)}
        </p>
      )}
      <div className="actions">
        <button type="submit" className="button button--primary" disabled={!password}>
          {t("setup.password.submit")}
        </button>
        <button type="button" className="button" onClick={() => controller.cancelSetupPassword()}>
          {t("setup.cancel")}
        </button>
      </div>
    </form>
  );
}

function RecoveryKeyEntryStep({ invalid }: { invalid: boolean }) {
  const controller = useSessionController();
  const [key, setKey] = useState("");
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!key.trim()) return;
    controller.submitRecoveryKey(key);
    setKey("");
  }
  return (
    <form onSubmit={submit} noValidate>
      <p className="type-body">{t("setup.restore.why")}</p>
      <TextField
        label={t("setup.restore.keyLabel")}
        name="recovery-key"
        autoComplete="off"
        spellCheck={false}
        value={key}
        onChange={(e) => setKey(e.target.value)}
        error={invalid ? t("setup.restore.invalid") : null}
        hint={t("setup.restore.hint")}
      />
      <div className="actions">
        <button type="submit" className="button button--primary" disabled={!key.trim()}>
          {t("setup.restore.submit")}
        </button>
        <button type="button" className="button" onClick={() => controller.skipRecoveryKey()}>
          {t("setup.restore.skip")}
        </button>
      </div>
    </form>
  );
}

function ShowRecoveryKeyStep({ recoveryKey }: { recoveryKey: string }) {
  const controller = useSessionController();
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(recoveryKey);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  function download() {
    const blob = new Blob([`${t("app.name")} recovery key\n\n${recoveryKey}\n`], {
      type: "text/plain",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "communication-system-recovery-key.txt";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div>
      <p className="type-body">{t("setup.key.why")}</p>
      <p className="banner banner--warning type-body" role="note">
        {t("setup.key.warning")}
      </p>
      <p className="recovery-key" aria-label={t("setup.key.label")}>
        <code>{recoveryKey}</code>
      </p>
      <div className="actions">
        <button type="button" className="button" onClick={() => void copy()}>
          {copied ? t("setup.key.copied") : t("setup.key.copy")}
        </button>
        <button type="button" className="button" onClick={download}>
          {t("setup.key.download")}
        </button>
      </div>
      <label className="radio">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        {t("setup.key.confirm")}
      </label>
      <div className="actions">
        <button
          type="button"
          className="button button--primary"
          disabled={!saved}
          onClick={() => controller.acknowledgeRecoveryKey()}
        >
          {t("setup.continue")}
        </button>
      </div>
    </div>
  );
}

/** Secure device setup (UI brief §6.3): drives the controller's setup prompts. */
export function SecureDeviceSetupScreen() {
  const controller = useSessionController();
  const { status, setup } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (status === "crypto_setup") void controller.runSetup();
  }, [controller, status]);

  useEffect(() => {
    if (status === "ready" && setup.phase !== "done") navigate("/chats", { replace: true });
  }, [status, setup.phase, navigate]);

  return (
    <section className="screen screen--centered" aria-labelledby="setup-title" aria-live="polite">
      <h1 id="setup-title" className="type-title">
        {t("setup.title")}
      </h1>
      <p className="type-body text-muted">{t("setup.intro")}</p>

      {(setup.phase === "idle" || setup.phase === "working") && (
        <Steps current={setup.phase === "working" ? setup.step : "checking"} />
      )}
      {setup.phase === "need_password" && <PasswordStep />}
      {setup.phase === "need_recovery_key" && <RecoveryKeyEntryStep invalid={setup.invalid} />}
      {setup.phase === "show_recovery_key" && <ShowRecoveryKeyStep recoveryKey={setup.key} />}
      {setup.phase === "failed" && (
        <div>
          <p className="banner banner--danger" role="alert">
            {setup.error.detail === "setup cancelled"
              ? t("setup.failed.cancelled")
              : setup.error.detail === "invalid recovery key"
                ? t("setup.restore.invalid")
                : authErrorMessage(setup.error)}
          </p>
          <div className="actions">
            <button
              type="button"
              className="button button--primary"
              onClick={() => controller.retrySetup()}
            >
              {t("setup.retry")}
            </button>
            <button type="button" className="button" onClick={() => void controller.signOut()}>
              {t("settings.signOut")}
            </button>
          </div>
        </div>
      )}
      {setup.phase === "done" && (
        <div>
          <p className="type-body" role="status">
            {setup.outcome.outcome === "skipped_needs_verification"
              ? t("setup.done.unverified")
              : setup.outcome.outcome === "restored"
                ? t("setup.done.restored")
                : t("setup.done.ready")}
          </p>
          <div className="actions">
            <button
              type="button"
              className="button button--primary"
              onClick={() => navigate("/chats", { replace: true })}
            >
              {t("setup.continue")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

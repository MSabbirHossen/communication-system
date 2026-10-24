import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { TextField } from "./TextField";
import { t } from "../i18n";

/** Minimal accessible modal: focus moves in; Escape or the Cancel button closes it. */
function Modal({
  title,
  children,
  onCancel,
}: {
  title: string;
  children: ReactNode;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>("input, button");
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (opener && opener.isConnected) opener.focus();
    };
  }, [onCancel]);
  return (
    <div className="modal__backdrop">
      <div
        ref={ref}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <h2 id="modal-title" className="type-heading">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}

/** Re-authentication prompt for UIA-protected operations. The password is handed to the caller and never kept. */
export function PasswordPrompt({
  title,
  explanation,
  onSubmit,
  onCancel,
}: {
  title: string;
  explanation: string;
  onSubmit: (password: string) => void;
  onCancel: () => void;
}) {
  const [password, setPassword] = useState("");
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!password) return;
    onSubmit(password);
    setPassword("");
  }
  return (
    <Modal title={title} onCancel={onCancel}>
      <form onSubmit={submit} noValidate>
        <p className="type-body">{explanation}</p>
        <TextField
          label={t("auth.password")}
          type="password"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div className="actions">
          <button type="submit" className="button button--primary" disabled={!password}>
            {t("dialog.confirm")}
          </button>
          <button type="button" className="button" onClick={onCancel}>
            {t("dialog.cancel")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  destructive,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal title={title} onCancel={onCancel}>
      <p className="type-body">{body}</p>
      <div className="actions">
        <button
          type="button"
          className={`button ${destructive ? "button--danger" : "button--primary"}`}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
        <button type="button" className="button" onClick={onCancel}>
          {t("dialog.cancel")}
        </button>
      </div>
    </Modal>
  );
}

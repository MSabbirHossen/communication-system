import { useId, useState, type InputHTMLAttributes } from "react";
import { t } from "../i18n";

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "type"> {
  label: string;
  error?: string | null | undefined;
  hint?: string | undefined;
  /** Password fields get a visibility toggle (UI brief §6.2). */
  type?: "text" | "password";
}

/** Labelled input with inline error text wired through aria-describedby/aria-invalid. */
export function TextField({ label, error, hint, type = "text", ...rest }: Props) {
  const id = useId();
  const [reveal, setReveal] = useState(false);
  const describedBy =
    [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") ||
    undefined;
  return (
    <div className="field">
      <label htmlFor={id} className="type-body field__label">
        {label}
      </label>
      <div className="field__control">
        <input
          id={id}
          type={type === "password" && reveal ? "text" : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className="input"
          {...rest}
        />
        {type === "password" && (
          <button
            type="button"
            className="button button--inline"
            aria-pressed={reveal}
            onClick={() => setReveal((v) => !v)}
          >
            {reveal ? t("field.hidePassword") : t("field.showPassword")}
          </button>
        )}
      </div>
      {hint && (
        <p id={`${id}-hint`} className="type-meta text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="type-meta field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

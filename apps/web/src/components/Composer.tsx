import { useState, type KeyboardEvent } from "react";
import { t } from "../i18n";

/**
 * Multiline composer: Enter sends, Shift+Enter inserts a newline (brief §6.6). The caller
 * owns the draft so it survives navigating between conversations.
 */
export function Composer({
  value,
  onChange,
  onSend,
  disabled,
  disabledReason,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: (text: string) => void;
  disabled?: boolean;
  disabledReason?: string | undefined;
}) {
  const [composing, setComposing] = useState(false);
  const canSend = !disabled && value.trim().length > 0;
  const send = () => {
    if (!canSend) return;
    onSend(value);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !composing) {
      e.preventDefault();
      send();
    }
  };
  return (
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      {disabled && disabledReason && (
        <p className="banner banner--danger" role="alert">
          {disabledReason}
        </p>
      )}
      <div className="composer__row">
        <textarea
          className="input composer__input"
          aria-label={t("chat.composer.label")}
          placeholder={disabled ? t("chat.composer.disabled") : t("chat.composer.placeholder")}
          rows={1}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onCompositionStart={() => setComposing(true)}
          onCompositionEnd={() => setComposing(false)}
        />
        <button type="submit" className="button button--primary" disabled={!canSend}>
          {t("chat.send")}
        </button>
      </div>
    </form>
  );
}

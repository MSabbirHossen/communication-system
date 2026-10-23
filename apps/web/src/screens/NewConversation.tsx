import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { TextField } from "../components/TextField";
import { t } from "../i18n";
import { toAuthError, type AuthError } from "../matrix/errors";
import {
  createDirectRoom,
  findDirectRoom,
  lookupUser,
  resolveUserId,
  type LookupResult,
} from "../matrix/rooms";
import { useSession } from "../session/SessionProvider";
import { authErrorMessage } from "./auth";

type Step =
  | { kind: "idle" }
  | { kind: "looking" }
  | { kind: "found"; userId: string; displayName: string; existingRoomId: string | null }
  | { kind: "not_found"; userId: string }
  | { kind: "starting"; userId: string };

/**
 * Start a conversation from an exact identifier (owner decision: no directory search until
 * discoverability settings exist). The display name is shown for recognition only; it is
 * not proof of identity (UI brief §6.5).
 */
export function NewConversationScreen() {
  const { client } = useSession();
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<AuthError | null>(null);
  const [step, setStep] = useState<Step>({ kind: "idle" });

  const me = client?.getUserId() ?? "";
  const serverName = client?.getDomain() ?? "";

  async function lookUp(e: FormEvent) {
    e.preventDefault();
    if (!client) return;
    setError(null);
    const resolved = resolveUserId(input, serverName, me);
    if (!resolved.ok) {
      setFieldError(t(`people.field.${resolved.reason}`));
      setStep({ kind: "idle" });
      return;
    }
    setFieldError(null);
    setStep({ kind: "looking" });
    let result: LookupResult;
    try {
      result = await lookupUser(client, resolved.userId);
    } catch (err) {
      setError(toAuthError(err));
      setStep({ kind: "idle" });
      return;
    }
    if (!result.found) {
      setStep({ kind: "not_found", userId: result.userId });
      return;
    }
    const existing = findDirectRoom(client, result.userId);
    setStep({
      kind: "found",
      userId: result.userId,
      displayName: result.displayName,
      existingRoomId: existing?.roomId ?? null,
    });
  }

  async function start(userId: string, existingRoomId: string | null) {
    if (!client) return;
    if (existingRoomId) {
      navigate(`/chats/${encodeURIComponent(existingRoomId)}`);
      return;
    }
    setStep({ kind: "starting", userId });
    setError(null);
    try {
      const roomId = await createDirectRoom(client, userId);
      navigate(`/chats/${encodeURIComponent(roomId)}`);
    } catch (err) {
      setError(toAuthError(err));
      setStep({ kind: "idle" });
    }
  }

  const busy = step.kind === "looking" || step.kind === "starting";

  return (
    <section className="pane" aria-labelledby="new-conversation-title">
      <h1 id="new-conversation-title" className="type-heading pane__title">
        {t("people.title")}
      </h1>
      <p className="type-body text-muted">{t("people.intro")}</p>
      <form onSubmit={(e) => void lookUp(e)} noValidate>
        <TextField
          label={t("people.field.label")}
          name="identifier"
          autoComplete="off"
          hint={t("people.field.hint", { server: serverName })}
          error={fieldError}
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <div className="actions actions--start">
          <button type="submit" className="button button--primary" disabled={busy || !input.trim()}>
            {step.kind === "looking" ? t("auth.working") : t("people.lookup")}
          </button>
          <Link to="/chats" className="button">
            {t("dialog.cancel")}
          </Link>
        </div>
      </form>

      {error && (
        <p className="banner banner--danger" role="alert">
          {authErrorMessage(error)}
        </p>
      )}

      {step.kind === "not_found" && (
        <p className="banner banner--danger" role="alert">
          {t("people.notFound")} <code>{step.userId}</code>
        </p>
      )}

      {(step.kind === "found" || step.kind === "starting") && (
        <div className="card" role="status">
          <p className="type-body">
            <strong>{step.kind === "found" ? step.displayName : step.userId}</strong>
          </p>
          <p className="type-meta text-muted">
            <code>{step.userId}</code>
          </p>
          <p className="type-meta text-muted">{t("people.identityNote")}</p>
          {step.kind === "found" && step.existingRoomId && (
            <p className="type-meta">{t("people.existing")}</p>
          )}
          <div className="actions actions--start">
            <button
              type="button"
              className="button button--primary"
              disabled={busy}
              onClick={() => step.kind === "found" && void start(step.userId, step.existingRoomId)}
            >
              {step.kind === "starting"
                ? t("auth.working")
                : step.kind === "found" && step.existingRoomId
                  ? t("people.open")
                  : t("people.start")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

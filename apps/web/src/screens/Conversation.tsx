import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router";
import { Composer } from "../components/Composer";
import { t, type MessageKey } from "../i18n";
import { toAuthError, type AuthError } from "../matrix/errors";
import { acceptInvite, declineInvite, type DirectConversation } from "../matrix/rooms";
import {
  EncryptionRequiredError,
  discardFailed,
  hasOlderHistory,
  loadOlder,
  markRead,
  readUpTo,
  retrySend,
  sendText,
  type MessageItem,
} from "../matrix/timeline";
import { useSession } from "../session/SessionProvider";
import { useUserSettings } from "../session/useSettings";
import { useRecipientSecurity } from "../session/useRecipientSecurity";
import { useConversations, useRoom, useRoomTimeline } from "../session/useRooms";
import { authErrorMessage } from "./auth";
import type { ShellContext } from "./Chats";

/** Drafts survive navigating between conversations within the session (never persisted). */
const drafts = new Map<string, string>();

/** How long the conversation must stay open and visible before it counts as read. */
const READ_DELAY_MS = 400;

/** Open conversations with fewer loaded messages than this fetch one page of history. */
const AUTO_LOAD_BELOW = 10;

function sameDay(a: number, b: number): boolean {
  const x = new Date(a);
  const y = new Date(b);
  return (
    x.getFullYear() === y.getFullYear() &&
    x.getMonth() === y.getMonth() &&
    x.getDate() === y.getDate()
  );
}

const timeFmt = new Intl.DateTimeFormat(undefined, { timeStyle: "short" });
const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: "full" });

function StatusLabel({ item }: { item: Extract<MessageItem, { status: string }> }) {
  const key = `chat.status.${item.status}` as MessageKey;
  return <span className={`msg__status msg__status--${item.status}`}>{t(key)}</span>;
}

function MessageRow({
  item,
  onRetry,
  onDiscard,
}: {
  item: MessageItem;
  onRetry: () => void;
  onDiscard: () => void;
}) {
  if (item.kind === "system") {
    return (
      <li className="messages__system type-meta text-muted">
        {t(`chat.system.${item.text}` as MessageKey)}
      </li>
    );
  }
  const side = item.mine ? "msg--mine" : "msg--theirs";
  return (
    <li className={`msg ${side}`}>
      <div className="msg__bubble">
        {item.kind === "text" && <p className="msg__body">{item.body}</p>}
        {item.kind === "undecryptable" && (
          <p className="msg__placeholder">
            {t("chat.undecryptable")}{" "}
            <span className="type-meta text-muted">
              ({t(`chat.decryptionReason.${item.code}` as MessageKey)})
            </span>
          </p>
        )}
        {item.kind === "unsupported" && (
          <p className="msg__placeholder">
            {t("chat.unsupported")} <code>{item.eventType}</code>
          </p>
        )}
        <p className="msg__meta type-meta text-muted">
          <time dateTime={new Date(item.ts).toISOString()}>
            {timeFmt.format(new Date(item.ts))}
          </time>
          {item.mine && item.kind !== "undecryptable" && <StatusLabel item={item} />}
          {item.mine && item.kind !== "undecryptable" && item.status === "failed" && (
            <span className="msg__actions">
              <button type="button" className="button button--inline" onClick={onRetry}>
                {t("chat.retry")}
              </button>
              <button
                type="button"
                className="button button--inline button--danger"
                onClick={onDiscard}
              >
                {t("chat.discard")}
              </button>
            </span>
          )}
        </p>
      </div>
    </li>
  );
}

function InvitePrompt({ conversation: c }: { conversation: DirectConversation }) {
  const { client } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AuthError | null>(null);
  const navigate = useNavigate();
  async function run(action: () => Promise<void>, then?: () => void) {
    if (!client) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      then?.();
    } catch (e) {
      setError(toAuthError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="card" role="status">
      <p className="type-body">{t("chats.invite.body")}</p>
      <p className="type-meta text-muted">
        <code>{c.otherUserId}</code>
      </p>
      {error && (
        <p className="banner banner--danger" role="alert">
          {authErrorMessage(error)}
        </p>
      )}
      <div className="actions actions--start">
        <button
          type="button"
          className="button button--primary"
          disabled={busy}
          onClick={() => client && void run(() => acceptInvite(client, c.roomId))}
        >
          {t("chats.invite.accept")}
        </button>
        <button
          type="button"
          className="button"
          disabled={busy}
          onClick={() =>
            client &&
            void run(
              () => declineInvite(client, c.roomId),
              () => navigate("/chats"),
            )
          }
        >
          {t("chats.invite.decline")}
        </button>
      </div>
    </div>
  );
}

export function ConversationScreen() {
  const { roomId = "" } = useParams();
  const { desktop } = useOutletContext<ShellContext>();
  const { client } = useSession();
  const room = useRoom(roomId);
  const conversation = useConversations().find((c) => c.roomId === roomId);
  const items = useRoomTimeline(room);
  const security = useRecipientSecurity(conversation?.otherUserId);
  const { settings } = useUserSettings();
  const [draft, setDraft] = useState(() => drafts.get(roomId) ?? "");
  const [error, setError] = useState<AuthError | "encryption_required" | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const listRef = useRef<HTMLOListElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const lastKey = items.at(-1)?.key;
  const lastMine = items.at(-1)?.mine === true;
  const hasMore = room ? hasOlderHistory(room) : false;

  // Follow new messages when the view is at the bottom, and always after an own send.
  useEffect(() => {
    const el = endRef.current;
    if (!el || typeof el.scrollIntoView !== "function") return;
    if (atBottom.current || lastMine) el.scrollIntoView({ block: "end" });
  }, [lastKey, lastMine]);

  // Mark the latest event read (privately: only this account's devices learn about it)
  // once the conversation has been open and visible for a moment (owner decision).
  useEffect(() => {
    if (!client || !room || conversation?.membership !== "join") return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      timer = setTimeout(
        () =>
          void markRead(client, room, { shareReadReceipts: settings.shareReadReceipts }).catch(
            () => undefined,
          ),
        READ_DELAY_MS,
      );
    };
    schedule();
    document.addEventListener("visibilitychange", schedule);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", schedule);
    };
  }, [client, room, conversation?.membership, lastKey, settings.shareReadReceipts]);

  const older = useCallback(async () => {
    if (!client || !room) return;
    const el = listRef.current;
    const before = el?.scrollHeight ?? 0;
    setLoadingOlder(true);
    setError(null);
    try {
      await loadOlder(client, room);
      // Keep the messages that were on screen where they were.
      requestAnimationFrame(() => {
        if (el) el.scrollTop += el.scrollHeight - before;
      });
    } catch (e) {
      setError(toAuthError(e));
    } finally {
      setLoadingOlder(false);
    }
  }, [client, room]);

  // A room that just synced holds only its newest events (the sync window is limited):
  // fetch one page of history automatically so a conversation does not open nearly empty.
  const autoLoadedFor = useRef<string | null>(null);
  const loadedCount = items.filter((i) => i.kind !== "system").length;
  useEffect(() => {
    if (!room || !hasMore || loadingOlder || loadedCount >= AUTO_LOAD_BELOW) return;
    if (autoLoadedFor.current === roomId) return;
    autoLoadedFor.current = roomId;
    void older();
  }, [room, roomId, hasMore, loadingOlder, loadedCount, older]);

  const onScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }, []);

  if (!client || !room || !conversation) {
    return (
      <div className="empty" role="alert">
        <h2 className="type-heading">{t("chat.notFound.title")}</h2>
        <Link to="/chats" className="link">
          {t("notFound.back")}
        </Link>
      </div>
    );
  }

  const updateDraft = (v: string) => {
    drafts.set(roomId, v);
    setDraft(v);
  };

  const send = (text: string) => {
    setError(null);
    updateDraft("");
    atBottom.current = true;
    sendText(client, roomId, text).catch((e: unknown) => {
      if (e instanceof EncryptionRequiredError) setError("encryption_required");
      else setError(toAuthError(e));
    });
  };

  const eventFor = (item: MessageItem) =>
    item.eventId ? room.findEventById(item.eventId) : undefined;

  const theirReadId = readUpTo(room, conversation.otherUserId);
  const readIndex = theirReadId ? items.findIndex((i) => i.eventId === theirReadId) : -1;
  let readMarkerKey: string | null = null;
  if (readIndex >= 0) {
    for (let i = readIndex; i >= 0; i--) {
      const it = items[i]!;
      if (it.mine && it.kind !== "system") {
        readMarkerKey = it.key;
        break;
      }
    }
  }
  const rows = items.map((item, i) => ({
    item,
    separator: i === 0 || !sameDay(items[i - 1]!.ts, item.ts),
    readByThem: item.key === readMarkerKey,
  }));

  return (
    <div className="chat">
      <header className="chat__header">
        {!desktop && (
          <Link to="/chats" className="button button--inline" aria-label={t("nav.back")}>
            ←
          </Link>
        )}
        <div className="chat__who">
          <h1 className="type-heading chat__name">{conversation.displayName}</h1>
          <p className="type-meta text-muted">
            <code>{conversation.otherUserId}</code>
          </p>
        </div>
        <div className="chat__badges">
          {security?.identity === "changed" ? (
            <span className="badge badge--warn">{t("security.identity.changed")}</span>
          ) : security && security.unverifiedCount > 0 ? (
            <span className="badge badge--warn">{t("security.unverifiedDevices")}</span>
          ) : security?.identity === "verified" ? (
            <span className="badge badge--ok">{t("security.identity.verified")}</span>
          ) : null}
          {conversation.encrypted ? (
            <span className="badge badge--ok">{t("chat.encrypted")}</span>
          ) : (
            <span className="badge badge--warn">{t("chat.notEncrypted")}</span>
          )}
          <Link
            to={`/chats/${encodeURIComponent(roomId)}/details`}
            className="button button--inline"
          >
            {t("chat.details")}
          </Link>
        </div>
      </header>

      {conversation.membership === "invite" ? (
        <InvitePrompt conversation={conversation} />
      ) : (
        <>
          {security?.identity === "changed" && (
            <p className="banner banner--danger" role="alert">
              {t("chat.identityChanged")}{" "}
              <Link to={`/chats/${encodeURIComponent(roomId)}/details`} className="link">
                {t("chat.details")}
              </Link>
            </p>
          )}
          <ol
            className="messages"
            aria-label={t("chat.messages")}
            ref={listRef}
            onScroll={onScroll}
          >
            {hasMore && (
              <li className="messages__system">
                <button
                  type="button"
                  className="button button--inline"
                  disabled={loadingOlder}
                  onClick={() => void older()}
                >
                  {loadingOlder ? t("loading") : t("chat.loadOlder")}
                </button>
              </li>
            )}
            {items.length === 0 && (
              <li className="messages__system type-meta text-muted">{t("chat.empty")}</li>
            )}
            {rows.map(({ item, separator, readByThem }) => (
              <li key={item.key} className="messages__group">
                {separator && (
                  <p className="messages__date type-meta text-muted">
                    {dateFmt.format(new Date(item.ts))}
                  </p>
                )}
                <ul className="messages__inner">
                  <MessageRow
                    item={item}
                    onRetry={() => {
                      const ev = eventFor(item);
                      if (ev) retrySend(client, room, ev).catch(() => undefined);
                    }}
                    onDiscard={() => {
                      const ev = eventFor(item);
                      if (ev) discardFailed(client, ev);
                    }}
                  />
                  {readByThem && (
                    <li className="msg__read type-meta text-muted">
                      {t("chat.readBy", { name: conversation.displayName })}
                    </li>
                  )}
                </ul>
              </li>
            ))}
            <li aria-hidden="true">
              <div ref={endRef} />
            </li>
          </ol>
          {error && (
            <p className="banner banner--danger" role="alert">
              {error === "encryption_required"
                ? t("chat.encryptionRequired")
                : authErrorMessage(error)}
            </p>
          )}
          <Composer
            value={draft}
            onChange={updateDraft}
            onSend={send}
            disabled={!conversation.encrypted}
            disabledReason={conversation.encrypted ? undefined : t("chat.encryptionRequired")}
          />
        </>
      )}
    </div>
  );
}

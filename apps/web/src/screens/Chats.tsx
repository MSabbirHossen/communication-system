import { useState } from "react";
import { Link, Outlet, useMatch, useNavigate, useOutletContext, useParams } from "react-router";
import { Skeleton } from "../components/Skeleton";
import { dateTimeFormat, t } from "../i18n";
import { toAuthError, type AuthError } from "../matrix/errors";
import { acceptInvite, declineInvite, type DirectConversation } from "../matrix/rooms";
import { useSession } from "../session/SessionProvider";
import { useConversations, useSyncState } from "../session/useRooms";
import { authErrorMessage } from "./auth";

export type ShellContext = { desktop: boolean };

/** Today → time; this year → day and month; otherwise the date. */
export function formatConversationTime(ts: number, now = Date.now()): string {
  if (!Number.isFinite(ts) || ts <= 0) return "";
  const d = new Date(ts);
  const n = new Date(now);
  const sameDay =
    d.getFullYear() === n.getFullYear() &&
    d.getMonth() === n.getMonth() &&
    d.getDate() === n.getDate();
  if (sameDay) return dateTimeFormat({ timeStyle: "short" }).format(d);
  if (d.getFullYear() === n.getFullYear())
    return dateTimeFormat({ day: "numeric", month: "short" }).format(d);
  return dateTimeFormat({ dateStyle: "medium" }).format(d);
}

function previewText(c: DirectConversation): string {
  switch (c.preview.kind) {
    case "text":
      return (c.preview.mine ? t("chats.preview.you") : "") + c.preview.body;
    case "encrypted":
      return t("chats.preview.encrypted");
    default:
      return t("chats.preview.none");
  }
}

function matches(c: DirectConversation, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return (
    c.displayName.toLowerCase().includes(needle) || c.otherUserId.toLowerCase().includes(needle)
  );
}

function ConversationRow({
  conversation: c,
  active,
  busy,
  onAccept,
  onDecline,
}: {
  conversation: DirectConversation;
  active: boolean;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const time = formatConversationTime(c.lastActiveTs);
  if (c.membership === "invite") {
    return (
      <li className="convo convo--invite">
        <div className="convo__main">
          <p className="type-body convo__name">
            {c.displayName} <span className="badge badge--warn">{t("chats.invite.label")}</span>
          </p>
          <p className="type-meta text-muted">
            <code>{c.otherUserId}</code>
          </p>
          <p className="type-meta text-muted">{t("chats.invite.body")}</p>
        </div>
        <div className="convo__actions">
          <button
            type="button"
            className="button button--primary button--inline"
            disabled={busy}
            onClick={onAccept}
          >
            {t("chats.invite.accept")}
          </button>
          <button
            type="button"
            className="button button--inline"
            disabled={busy}
            onClick={onDecline}
          >
            {t("chats.invite.decline")}
          </button>
        </div>
      </li>
    );
  }
  return (
    <li className={`convo${active ? " convo--active" : ""}`}>
      <Link
        to={`/chats/${encodeURIComponent(c.roomId)}`}
        className="convo__link"
        aria-current={active ? "page" : undefined}
      >
        <div className="convo__main">
          <p className="type-body convo__name">
            {c.displayName}
            {c.unreadCount > 0 && (
              <span className="convo__unread badge badge--ok">
                {t("chats.unread", { count: c.unreadCount })}
              </span>
            )}
          </p>
          <p className="type-meta text-muted convo__preview" dir="auto">
            {previewText(c)}
          </p>
        </div>
        <span className="type-meta text-muted convo__time">{time}</span>
      </Link>
    </li>
  );
}

function ConversationList({ activeRoomId }: { activeRoomId: string | undefined }) {
  const { client } = useSession();
  const conversations = useConversations();
  const syncState = useSyncState();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<AuthError | null>(null);
  const navigate = useNavigate();

  const visible = conversations.filter((c) => matches(c, query));
  const syncFailed = syncState === "ERROR" || syncState === "RECONNECTING";

  async function run(roomId: string, action: () => Promise<void>, then?: () => void) {
    setBusy(roomId);
    setError(null);
    try {
      await action();
      then?.();
    } catch (e) {
      setError(toAuthError(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="pane pane--list" aria-label={t("nav.chats")}>
      <div className="chats__toolbar">
        <h1 className="type-heading pane__title">{t("nav.chats")}</h1>
        <Link to="/chats/new" className="button button--primary button--inline">
          {t("chats.new")}
        </Link>
      </div>
      {conversations.length > 0 && (
        <input
          className="input"
          type="search"
          aria-label={t("chats.search")}
          placeholder={t("chats.search")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}
      {syncFailed && (
        <p className="banner banner--danger" role="alert">
          {t("chats.sync.error")}{" "}
          <button
            type="button"
            className="button button--inline"
            onClick={() => client?.retryImmediately()}
          >
            {t("chats.sync.retry")}
          </button>
        </p>
      )}
      {error && (
        <p className="banner banner--danger" role="alert">
          {authErrorMessage(error)}
        </p>
      )}
      {syncState === null ? (
        <Skeleton lines={5} />
      ) : conversations.length === 0 ? (
        <div className="empty">
          <h2 className="type-heading">{t("chats.empty.title")}</h2>
          <p className="type-body text-muted">{t("chats.empty.body")}</p>
        </div>
      ) : visible.length === 0 ? (
        <p className="type-body text-muted" role="status">
          {t("chats.search.noResults")}
        </p>
      ) : (
        <ul className="convo-list" aria-label={t("chats.list")}>
          {visible.map((c) => (
            <ConversationRow
              key={c.roomId}
              conversation={c}
              active={c.roomId === activeRoomId}
              busy={busy === c.roomId}
              onAccept={() =>
                client &&
                void run(
                  c.roomId,
                  () => acceptInvite(client, c.roomId),
                  () => navigate(`/chats/${encodeURIComponent(c.roomId)}`),
                )
              }
              onDecline={() => client && void run(c.roomId, () => declineInvite(client, c.roomId))}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Chats layout: the conversation list, with the selected conversation beside it on desktop
 * (brief §8, APP_FLOW §3). Below the desktop breakpoint a selected conversation takes the
 * whole screen and the list is its own route.
 */
export function ChatsScreen() {
  const { desktop } = useOutletContext<ShellContext>();
  const { roomId } = useParams();
  const startingNew = useMatch("/chats/new") !== null;
  const showDetail = desktop || roomId !== undefined || startingNew;
  const showList = desktop || (roomId === undefined && !startingNew);
  return (
    <div className={`two-pane${desktop ? " two-pane--split" : ""}`} data-panes={desktop ? 2 : 1}>
      {showList && <ConversationList activeRoomId={roomId} />}
      {showDetail && (
        <section className="pane pane--detail" aria-label={t("chats.select")}>
          <Outlet context={{ desktop }} />
        </section>
      )}
    </div>
  );
}

/** Index route of /chats on desktop: nothing selected yet. */
export function NoConversationSelected() {
  return (
    <div className="empty">
      <h2 className="type-heading">{t("chats.select")}</h2>
    </div>
  );
}

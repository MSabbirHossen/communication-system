// Browser notifications for new messages (UI brief §6.9, THREAT_MODEL TM-12). The text
// never contains the message body: at most a generic line or the sender's display name,
// per the user's notification-preview setting. Shown only while the tab is hidden.
import {
  EventType,
  MatrixEventEvent,
  RoomEvent,
  SyncState,
  type MatrixEvent,
  type Room,
} from "matrix-js-sdk";
import { t } from "../i18n";
import type { MatrixClient } from "../matrix/client";
import { directRoomsMap, isDirectRoom } from "../matrix/rooms";
import type { NotificationPreview } from "../matrix/settings";

export type BrowserPermission = "default" | "granted" | "denied";
export type NotificationPermissionState = BrowserPermission | "unsupported";

export interface NotificationHandle {
  onclick: ((this: unknown, ev: unknown) => unknown) | null;
  close(): void;
}

/** The subset of the Web Notifications API the client uses (injectable for tests). */
export interface NotificationApi {
  readonly permission: BrowserPermission;
  requestPermission(): Promise<BrowserPermission>;
  new (title: string, options?: { tag?: string }): NotificationHandle;
}

export function notificationApi(
  win: { Notification?: unknown } = globalThis as { Notification?: unknown },
): NotificationApi | null {
  const api = win.Notification;
  return typeof api === "function" ? (api as unknown as NotificationApi) : null;
}

export function notificationPermission(
  api: NotificationApi | null = notificationApi(),
): NotificationPermissionState {
  return api ? api.permission : "unsupported";
}

/** Ask the browser; call only from a user action. */
export async function requestNotificationPermission(
  api: NotificationApi | null = notificationApi(),
): Promise<NotificationPermissionState> {
  if (!api) return "unsupported";
  try {
    return await api.requestPermission();
  } catch {
    return api.permission;
  }
}

/** The notification text for a setting; null when notifications are off. Never the body. */
export function notificationText(preview: NotificationPreview, senderName: string): string | null {
  if (preview === "off") return null;
  if (preview === "sender") return t("notifications.sender", { name: senderName });
  return t("notifications.generic");
}

export interface WatchOptions {
  preview(): NotificationPreview;
  hidden(): boolean;
  show(text: string, roomId: string): void;
}

const MAX_SEEN = 500;

/**
 * Notify about new incoming text messages in joined direct rooms while the tab is hidden.
 * Only live events during an active sync count (not the initial or cached sync, not
 * back-pagination); encrypted events are considered once decrypted; each event at most once.
 */
export function watchNewMessages(client: MatrixClient, opts: WatchOptions): () => void {
  const me = client.getUserId() ?? "";
  const seen = new Set<string>();
  const awaitingDecryption = new Set<string>();

  const remember = (id: string) => {
    seen.add(id);
    if (seen.size > MAX_SEEN) {
      const oldest = seen.values().next().value;
      if (oldest !== undefined) seen.delete(oldest);
    }
  };

  const consider = (ev: MatrixEvent, room: Room | null | undefined) => {
    const id = ev.getId();
    if (!id || !room || seen.has(id)) return;
    if (ev.getSender() === me || ev.isDecryptionFailure()) return;
    if (ev.getType() !== EventType.RoomMessage) return;
    const content = ev.getContent() as { msgtype?: unknown };
    if (content.msgtype !== "m.text") return;
    if (room.getMyMembership() !== "join") return;
    if (!isDirectRoom(room, me, directRoomsMap(client))) return;
    remember(id);
    if (!opts.hidden()) return;
    const senderId = ev.getSender() ?? "";
    const name = room.getMember(senderId)?.name ?? senderId;
    const text = notificationText(opts.preview(), name);
    if (text) opts.show(text, room.roomId);
  };

  const onTimeline = (
    ev: MatrixEvent,
    room: Room | undefined,
    toStartOfTimeline: boolean | undefined,
    _removed: boolean,
    data: { liveEvent?: boolean },
  ) => {
    if (toStartOfTimeline || !data.liveEvent) return;
    if (client.getSyncState() !== SyncState.Syncing) return;
    const id = ev.getId();
    if (ev.isBeingDecrypted() || ev.getType() === EventType.RoomMessageEncrypted) {
      if (id) awaitingDecryption.add(id);
      return;
    }
    consider(ev, room);
  };

  const onDecrypted = (ev: MatrixEvent) => {
    const id = ev.getId();
    if (!id || !awaitingDecryption.delete(id)) return;
    const roomId = ev.getRoomId();
    consider(ev, roomId ? client.getRoom(roomId) : null);
  };

  client.on(RoomEvent.Timeline, onTimeline);
  client.on(MatrixEventEvent.Decrypted, onDecrypted);
  return () => {
    client.removeListener(RoomEvent.Timeline, onTimeline);
    client.removeListener(MatrixEventEvent.Decrypted, onDecrypted);
  };
}

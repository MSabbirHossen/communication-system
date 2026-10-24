// Conversation timeline over SDK state: maps live-timeline events to items the screen can
// render with honest states (TRD §7.1), and performs sends, retries and discards through
// the SDK so transaction ids and local echo stay the SDK's (TM-20). Sending into a room
// without encryption is refused here, before any request (TM-04 app guard).
import {
  EventStatus,
  EventTimeline,
  EventType,
  MatrixEventEvent,
  ReceiptType,
  RoomEvent,
  type MatrixClient,
  type MatrixEvent,
  type Room,
} from "matrix-js-sdk";
import type { DecryptionFailureCode } from "matrix-js-sdk/lib/crypto-api/index.js";

export type MessageStatus = "pending" | "sent" | "failed";

interface ItemBase {
  key: string;
  eventId: string | undefined;
  senderId: string;
  mine: boolean;
  ts: number;
}

export type MessageItem =
  | (ItemBase & { kind: "text"; body: string; status: MessageStatus })
  | (ItemBase & { kind: "undecryptable"; code: DecryptionFailureCode | "unknown" })
  | (ItemBase & { kind: "unsupported"; eventType: string; status: MessageStatus })
  | (ItemBase & {
      kind: "system";
      text: "encryption_enabled" | "joined" | "left" | "invited" | "verification_request";
    });

export class EncryptionRequiredError extends Error {
  constructor(public readonly roomId: string) {
    super(`refusing to send into ${roomId}: encryption is not enabled`);
    this.name = "EncryptionRequiredError";
  }
}

/** Honest status from the SDK's send state: nothing is "sent" before the server accepted it. */
export function statusOf(ev: MatrixEvent): MessageStatus {
  switch (ev.status) {
    case EventStatus.NOT_SENT:
    case EventStatus.CANCELLED:
      return "failed";
    case EventStatus.ENCRYPTING:
    case EventStatus.SENDING:
    case EventStatus.QUEUED:
      return "pending";
    default:
      return "sent";
  }
}

export function toItem(ev: MatrixEvent, me: string): MessageItem | null {
  const senderId = ev.getSender() ?? "";
  const base: ItemBase = {
    key: ev.getId() ?? `${senderId}-${ev.getTs()}`,
    eventId: ev.getId(),
    senderId,
    mine: senderId === me,
    ts: ev.getTs(),
  };
  if (ev.isDecryptionFailure()) {
    return { ...base, kind: "undecryptable", code: ev.decryptionFailureReason ?? "unknown" };
  }
  const type = ev.getType();
  if (type === EventType.RoomMessage) {
    const content = ev.getContent() as { msgtype?: unknown; body?: unknown };
    if (content.msgtype === "m.text" && typeof content.body === "string") {
      return { ...base, kind: "text", body: content.body, status: statusOf(ev) };
    }
    // In-room verification requests travel as m.room.message events (Phase 3, commit 6).
    if (content.msgtype === "m.key.verification.request") {
      return { ...base, kind: "system", text: "verification_request" };
    }
    return {
      ...base,
      kind: "unsupported",
      eventType: String(content.msgtype ?? type),
      status: statusOf(ev),
    };
  }
  if (type === EventType.RoomEncryption)
    return { ...base, kind: "system", text: "encryption_enabled" };
  if (type === EventType.RoomMember) {
    const membership = (ev.getContent() as { membership?: string }).membership;
    if (membership === "join") return { ...base, kind: "system", text: "joined" };
    if (membership === "leave") return { ...base, kind: "system", text: "left" };
    if (membership === "invite") return { ...base, kind: "system", text: "invited" };
  }
  return null;
}

/** Items for the room's live timeline (pending local echoes included, in order). */
export function timelineItems(room: Room, me: string): MessageItem[] {
  const out: MessageItem[] = [];
  for (const ev of room.getLiveTimeline().getEvents()) {
    const item = toItem(ev, me);
    if (item) out.push(item);
  }
  return out;
}

const ROOM_EVENTS = [
  RoomEvent.Timeline,
  RoomEvent.TimelineReset,
  RoomEvent.LocalEchoUpdated,
  RoomEvent.Receipt,
] as const;

/** Call `cb` whenever the room's timeline, local echoes or decryption state change. */
export function subscribeRoom(client: MatrixClient, room: Room, cb: () => void): () => void {
  const forRoom = (_ev: unknown, r?: Room) => {
    if (!r || r.roomId === room.roomId) cb();
  };
  const onDecrypted = (ev: MatrixEvent) => {
    if (ev.getRoomId() === room.roomId) cb();
  };
  for (const e of ROOM_EVENTS) client.on(e, forRoom);
  client.on(MatrixEventEvent.Decrypted, onDecrypted);
  return () => {
    for (const e of ROOM_EVENTS) client.removeListener(e, forRoom);
    client.removeListener(MatrixEventEvent.Decrypted, onDecrypted);
  };
}

/** Whether the client will encrypt events for this room (state event + crypto backend). */
export async function canSendEncrypted(client: MatrixClient, roomId: string): Promise<boolean> {
  const crypto = client.getCrypto();
  const room = client.getRoom(roomId);
  if (!crypto || !room || !room.hasEncryptionStateEvent()) return false;
  return crypto.isEncryptionEnabledInRoom(roomId);
}

/**
 * Send a text message. Resolves when the server accepted the event; the local echo appears
 * in the timeline immediately with a pending status. Never sends plaintext into a room
 * that is not encrypted.
 */
export async function sendText(client: MatrixClient, roomId: string, text: string): Promise<void> {
  const body = text.trim();
  if (!body) return;
  if (!(await canSendEncrypted(client, roomId))) throw new EncryptionRequiredError(roomId);
  await client.sendTextMessage(roomId, body);
}

/** Retry a failed send with the same event (and therefore the same transaction id). */
export function retrySend(client: MatrixClient, room: Room, event: MatrixEvent): Promise<unknown> {
  return client.resendEvent(event, room);
}

/** Drop a failed or queued send without sending it. */
export function discardFailed(client: MatrixClient, event: MatrixEvent): void {
  client.cancelPendingEvent(event);
}

/**
 * Whether the room's live timeline can be paginated further back: a back-pagination token
 * exists and the room's creation event is not already loaded (the SDK keeps a token until a
 * pagination comes back empty, which would show a pointless button on a fresh room).
 */
export function hasOlderHistory(room: Room): boolean {
  const timeline = room.getLiveTimeline();
  if (timeline.getEvents()[0]?.getType() === EventType.RoomCreate) return false;
  return timeline.getPaginationToken(EventTimeline.BACKWARDS) !== null;
}

/** Load up to `limit` older events into the live timeline; resolves to whether more remain. */
export async function loadOlder(client: MatrixClient, room: Room, limit = 30): Promise<boolean> {
  await client.scrollback(room, limit);
  return hasOlderHistory(room);
}

const lastReceipt = new Map<string, string>();

export interface ReadOptions {
  /** Also send the public m.read receipt so the other person sees "Read" (owner-controlled setting). */
  shareReadReceipts: boolean;
}

/**
 * Mark the latest server-accepted event as read. The private receipt (m.read.private) is
 * always sent so the user's own devices agree on unread state; the public receipt is sent
 * only when the user chose to share read state (ADR-0004 D5, ADR-0005). Skips pending local
 * echoes and repeats.
 */
export async function markRead(
  client: MatrixClient,
  room: Room,
  options: ReadOptions = { shareReadReceipts: false },
): Promise<void> {
  const events = room.getLiveTimeline().getEvents();
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i]!;
    const id = ev.getId();
    if (!id || ev.status !== null) continue; // pending or failed local echo
    const key = `${room.roomId}:${options.shareReadReceipts ? "public" : "private"}`;
    if (lastReceipt.get(key) === id) return;
    lastReceipt.set(key, id);
    await client.sendReadReceipt(ev, ReceiptType.ReadPrivate);
    if (options.shareReadReceipts) await client.sendReadReceipt(ev, ReceiptType.Read);
    return;
  }
}

/** Kept for callers that only ever want the private receipt. */
export function markReadPrivately(client: MatrixClient, room: Room): Promise<void> {
  return markRead(client, room, { shareReadReceipts: false });
}

/**
 * The id of the last event `userId` has publicly marked read, or null when they share no
 * read state (synthesized receipts for their own sends are ignored).
 */
export function readUpTo(room: Room, userId: string): string | null {
  return room.getReadReceiptForUserId(userId, true, ReceiptType.Read)?.eventId ?? null;
}

// Direct-conversation model over the SDK's room state (ADR-0004). One Matrix room per pair of
// users; the SDK is the source of truth, this module only reads it into a list the screens
// can render and keeps the `m.direct` account data in step (the SDK does not maintain it).
import {
  EventType,
  NotificationCountType,
  Preset,
  type MatrixClient,
  type Room,
} from "matrix-js-sdk";

export type ConversationMembership = "join" | "invite";

export type ConversationPreview =
  { kind: "text"; body: string; mine: boolean } | { kind: "encrypted" } | { kind: "none" };

export interface DirectConversation {
  roomId: string;
  otherUserId: string;
  /** The other member's display name, or their id when none is known. */
  displayName: string;
  membership: ConversationMembership;
  lastActiveTs: number;
  preview: ConversationPreview;
  unreadCount: number;
  /** The room has an `m.room.encryption` state event. */
  encrypted: boolean;
}

type DirectMap = Record<string, string[]>;

/** `m.direct` account data: other user id → room ids. */
export function directRoomsMap(client: MatrixClient): DirectMap {
  const content = client.getAccountData(EventType.Direct)?.getContent() as DirectMap | undefined;
  return content && typeof content === "object" ? content : {};
}

function userForRoom(map: DirectMap, roomId: string): string | undefined {
  for (const [userId, rooms] of Object.entries(map)) {
    if (Array.isArray(rooms) && rooms.includes(roomId)) return userId;
  }
  return undefined;
}

/** The other participant of a direct room, or undefined when it cannot be determined. */
export function otherUserOf(room: Room, me: string, map: DirectMap): string | undefined {
  const fromMap = userForRoom(map, room.roomId);
  if (fromMap) return fromMap;
  const inviter = room.getDMInviter();
  if (inviter) return inviter;
  const others = room
    .getMembers()
    .filter((m) => m.userId !== me && (m.membership === "join" || m.membership === "invite"));
  return others.length === 1 ? others[0]!.userId : undefined;
}

/** A room counts as direct when `m.direct` says so, or its membership event was flagged `is_direct`. */
export function isDirectRoom(room: Room, me: string, map: DirectMap): boolean {
  if (userForRoom(map, room.roomId)) return true;
  if (room.getDMInviter()) return true;
  const myMember = room.getMember(me)?.events.member?.getContent() as
    { is_direct?: unknown } | undefined;
  return myMember?.is_direct === true;
}

function previewOf(room: Room, me: string): ConversationPreview {
  const events = room.getLiveTimeline().getEvents();
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i]!;
    if (ev.isDecryptionFailure()) return { kind: "encrypted" };
    if (ev.getType() !== EventType.RoomMessage) continue;
    const body = (ev.getContent() as { body?: unknown }).body;
    if (typeof body === "string") return { kind: "text", body, mine: ev.getSender() === me };
  }
  return { kind: "none" };
}

/** Direct conversations the user is in or invited to, most recent first. */
export function listDirectConversations(client: MatrixClient): DirectConversation[] {
  const me = client.getUserId();
  if (!me) return [];
  const map = directRoomsMap(client);
  const out: DirectConversation[] = [];
  for (const room of client.getVisibleRooms()) {
    const membership = room.getMyMembership();
    if (membership !== "join" && membership !== "invite") continue;
    if (!isDirectRoom(room, me, map)) continue;
    const otherUserId = otherUserOf(room, me, map);
    if (!otherUserId) continue;
    out.push({
      roomId: room.roomId,
      otherUserId,
      displayName: room.getMember(otherUserId)?.name ?? otherUserId,
      membership,
      lastActiveTs: room.getLastActiveTimestamp(),
      preview: previewOf(room, me),
      unreadCount: room.getUnreadNotificationCount(NotificationCountType.Total),
      encrypted: room.hasEncryptionStateEvent(),
    });
  }
  return out.sort((a, b) => b.lastActiveTs - a.lastActiveTs);
}

/** Add `roomId` to the user's `m.direct` entry (no-op when already recorded). */
export async function recordDirectRoom(
  client: MatrixClient,
  userId: string,
  roomId: string,
): Promise<void> {
  const map = directRoomsMap(client);
  const rooms = Array.isArray(map[userId]) ? map[userId]! : [];
  if (rooms.includes(roomId)) return;
  await client.setAccountData(EventType.Direct, { ...map, [userId]: [...rooms, roomId] });
}

/** Join an invited direct room and record it under the inviter. */
export async function acceptInvite(client: MatrixClient, roomId: string): Promise<void> {
  const me = client.getUserId() ?? "";
  const room = client.getRoom(roomId);
  const other = room ? otherUserOf(room, me, directRoomsMap(client)) : undefined;
  await client.joinRoom(roomId);
  if (other) await recordDirectRoom(client, other, roomId);
}

/** Decline an invitation (leaves the room; nothing is recorded). */
export async function declineInvite(client: MatrixClient, roomId: string): Promise<void> {
  await client.leave(roomId);
}

// --- Starting a conversation (owner decision 2026-10-23: exact identifier only) ------------

/** Matrix user id grammar accepted for input: `@localpart:server[:port]`. */
const USER_ID = /^@[a-z0-9._=/+-]+:[A-Za-z0-9.-]+(?::\d{1,5})?$/;
const LOCALPART = /^[a-z0-9._=/+-]+$/;

export type ResolveResult =
  { ok: true; userId: string } | { ok: false; reason: "empty" | "invalid" | "self" };

/** Turn what the user typed into a full user id (`bob` → `@bob:<server>`); never a network call. */
export function resolveUserId(input: string, serverName: string, me: string): ResolveResult {
  const raw = input.trim();
  if (!raw) return { ok: false, reason: "empty" };
  const userId = raw.startsWith("@") ? raw : LOCALPART.test(raw) ? `@${raw}:${serverName}` : raw;
  if (!USER_ID.test(userId)) return { ok: false, reason: "invalid" };
  if (userId === me) return { ok: false, reason: "self" };
  return { ok: true, userId };
}

export type LookupResult =
  { found: true; userId: string; displayName: string } | { found: false; userId: string };

/** Check that an account exists and fetch its display name (profile endpoint). */
export async function lookupUser(client: MatrixClient, userId: string): Promise<LookupResult> {
  try {
    const profile = await client.getProfileInfo(userId);
    return { found: true, userId, displayName: profile.displayname?.trim() || userId };
  } catch (err) {
    const code = (err as { errcode?: string }).errcode;
    if (code === "M_NOT_FOUND") return { found: false, userId };
    throw err;
  }
}

/** An existing direct room with `userId` (joined first, then an invitation from them). */
export function findDirectRoom(client: MatrixClient, userId: string): DirectConversation | null {
  const list = listDirectConversations(client).filter((c) => c.otherUserId === userId);
  return list.find((c) => c.membership === "join") ?? list[0] ?? null;
}

/** Create an invite-only, encrypted direct room with `userId` and record it in `m.direct`. */
export async function createDirectRoom(client: MatrixClient, userId: string): Promise<string> {
  const { room_id: roomId } = await client.createRoom({
    is_direct: true,
    invite: [userId],
    preset: Preset.TrustedPrivateChat,
    initial_state: [
      {
        type: EventType.RoomEncryption,
        state_key: "",
        content: { algorithm: "m.megolm.v1.aes-sha2" },
      },
    ],
  });
  await recordDirectRoom(client, userId, roomId);
  return roomId;
}

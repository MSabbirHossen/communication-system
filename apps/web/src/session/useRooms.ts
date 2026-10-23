// React bindings for the conversation list: a per-client store that recomputes the list
// from SDK state when rooms, membership, timelines, receipts, decryption or account data
// change, coalesced to one recompute per tick.
import { useSyncExternalStore } from "react";
import { ClientEvent, MatrixEventEvent, RoomEvent, type Room, type SyncState } from "matrix-js-sdk";
import type { MatrixClient } from "../matrix/client";
import { listDirectConversations, type DirectConversation } from "../matrix/rooms";
import { subscribeRoom, timelineItems, type MessageItem } from "../matrix/timeline";
import { useSession } from "./SessionProvider";

interface ConversationStore {
  subscribe(cb: () => void): () => void;
  getSnapshot(): DirectConversation[];
}

const EVENTS = [
  ClientEvent.Room,
  ClientEvent.DeleteRoom,
  ClientEvent.AccountData,
  RoomEvent.MyMembership,
  RoomEvent.Timeline,
  RoomEvent.TimelineReset,
  RoomEvent.Receipt,
  RoomEvent.Name,
  MatrixEventEvent.Decrypted,
] as const;

const stores = new WeakMap<MatrixClient, ConversationStore>();

export function conversationStore(client: MatrixClient): ConversationStore {
  const existing = stores.get(client);
  if (existing) return existing;
  let snapshot = listDirectConversations(client);
  const listeners = new Set<() => void>();
  let scheduled = false;
  const recompute = () => {
    scheduled = false;
    snapshot = listDirectConversations(client);
    listeners.forEach((l) => l());
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(recompute);
  };
  let attached = false;
  const store: ConversationStore = {
    subscribe: (cb) => {
      listeners.add(cb);
      if (!attached) {
        attached = true;
        for (const e of EVENTS) client.on(e, schedule);
        schedule();
      }
      return () => {
        listeners.delete(cb);
        if (listeners.size === 0 && attached) {
          attached = false;
          for (const e of EVENTS) client.removeListener(e, schedule);
        }
      };
    },
    getSnapshot: () => snapshot,
  };
  stores.set(client, store);
  return store;
}

const EMPTY: DirectConversation[] = [];
const noStore: ConversationStore = { subscribe: () => () => {}, getSnapshot: () => EMPTY };

/** The signed-in user's direct conversations, most recent first (empty without a client). */
export function useConversations(): DirectConversation[] {
  const { client } = useSession();
  const store = client ? conversationStore(client) : noStore;
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

/** The SDK's sync state (null before the first sync). */
export function useSyncState(): SyncState | null {
  const { client } = useSession();
  return useSyncExternalStore(
    (cb) => {
      if (!client) return () => {};
      client.on(ClientEvent.Sync, cb);
      return () => client.removeListener(ClientEvent.Sync, cb);
    },
    () => client?.getSyncState() ?? null,
    () => null,
  );
}

/** The SDK room for an id (re-evaluated as the conversation list changes). */
export function useRoom(roomId: string | undefined): Room | null {
  const { client } = useSession();
  useConversations(); // re-render when rooms appear or change
  return roomId && client ? client.getRoom(roomId) : null;
}

interface TimelineStore {
  subscribe(cb: () => void): () => void;
  getSnapshot(): MessageItem[];
}

const timelineStores = new WeakMap<Room, TimelineStore>();

function timelineStore(client: MatrixClient, room: Room): TimelineStore {
  const existing = timelineStores.get(room);
  if (existing) return existing;
  const me = client.getUserId() ?? "";
  let snapshot = timelineItems(room, me);
  const listeners = new Set<() => void>();
  let unsubscribe: (() => void) | null = null;
  let scheduled = false;
  const recompute = () => {
    scheduled = false;
    snapshot = timelineItems(room, me);
    listeners.forEach((l) => l());
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(recompute);
  };
  const store: TimelineStore = {
    subscribe: (cb) => {
      listeners.add(cb);
      if (!unsubscribe) {
        unsubscribe = subscribeRoom(client, room, schedule);
        schedule();
      }
      return () => {
        listeners.delete(cb);
        if (listeners.size === 0 && unsubscribe) {
          unsubscribe();
          unsubscribe = null;
        }
      };
    },
    getSnapshot: () => snapshot,
  };
  timelineStores.set(room, store);
  return store;
}

const NO_ITEMS: MessageItem[] = [];
const noTimeline: TimelineStore = { subscribe: () => () => {}, getSnapshot: () => NO_ITEMS };

/** Live timeline items for a room (empty without a room). */
export function useRoomTimeline(room: Room | null): MessageItem[] {
  const { client } = useSession();
  const store = client && room ? timelineStore(client, room) : noTimeline;
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

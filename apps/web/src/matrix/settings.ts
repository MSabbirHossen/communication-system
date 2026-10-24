// User settings kept as the client's own Matrix account data (ADR-0005): visible to the
// homeserver (not secret), synced to the user's devices, honoured by this client. Server-side
// enforcement of discoverability belongs to the Phase 6 application API; these settings only
// change what this client sends (receipts, presence) and shows (notification text).
import { ClientEvent, SetPresence, type MatrixClient, type MatrixEvent } from "matrix-js-sdk";

export const SETTINGS_EVENT_TYPE = "org.cs.web.settings";

export type NotificationPreview = "off" | "generic" | "sender";

export interface UserSettings {
  /** Send public read receipts (m.read) so the other person sees "Read". Private receipts are always sent. */
  shareReadReceipts: boolean;
  /** Let the server tell others whether you are online. */
  sharePresence: boolean;
  /** Browser notification text: nothing, "New message", or "New message from <name>". Never content. */
  notificationPreview: NotificationPreview;
}

export const DEFAULT_SETTINGS: UserSettings = {
  shareReadReceipts: false,
  sharePresence: true,
  notificationPreview: "generic",
};

/** Build settings from untrusted account-data content: unknown shapes fall back to defaults. */
export function parseSettings(content: unknown): UserSettings {
  const c = (content && typeof content === "object" ? content : {}) as Record<string, unknown>;
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  const preview = (v: unknown): NotificationPreview =>
    v === "off" || v === "generic" || v === "sender" ? v : DEFAULT_SETTINGS.notificationPreview;
  return {
    shareReadReceipts: bool(c.shareReadReceipts, DEFAULT_SETTINGS.shareReadReceipts),
    sharePresence: bool(c.sharePresence, DEFAULT_SETTINGS.sharePresence),
    notificationPreview: preview(c.notificationPreview),
  };
}

export function readSettings(client: MatrixClient): UserSettings {
  const ev = client.getAccountData(SETTINGS_EVENT_TYPE as never) as MatrixEvent | undefined;
  return parseSettings(ev?.getContent());
}

/** Merge `patch` into the stored settings and write them back. */
export async function writeSettings(
  client: MatrixClient,
  patch: Partial<UserSettings>,
): Promise<UserSettings> {
  const next = { ...readSettings(client), ...patch };
  await client.setAccountData(SETTINGS_EVENT_TYPE as never, next as never);
  return next;
}

/** Call `cb` when the settings account data changes (from this or another device). */
export function watchSettings(client: MatrixClient, cb: (s: UserSettings) => void): () => void {
  const handler = (ev?: MatrixEvent) => {
    if (ev?.getType() === SETTINGS_EVENT_TYPE) cb(parseSettings(ev.getContent()));
  };
  client.on(ClientEvent.AccountData, handler);
  return () => client.removeListener(ClientEvent.AccountData, handler);
}

/**
 * Publish the presence choice: the sync loop reports online or offline from now on, and when
 * sharing is off the status is set to offline right away rather than after the server's
 * inactivity timeout.
 */
export async function applyPresence(client: MatrixClient, settings: UserSettings): Promise<void> {
  if (settings.sharePresence) {
    await client.setSyncPresence(SetPresence.Online);
  } else {
    await client.setSyncPresence(SetPresence.Offline);
    await client.setPresence({ presence: "offline" });
  }
}

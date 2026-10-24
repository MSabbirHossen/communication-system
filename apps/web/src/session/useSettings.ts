import { useCallback, useEffect, useState } from "react";
import { UserEvent, type User } from "matrix-js-sdk";
import {
  DEFAULT_SETTINGS,
  applyPresence,
  readSettings,
  watchSettings,
  writeSettings,
  type UserSettings,
} from "../matrix/settings";
import { useSession } from "./SessionProvider";

/** The signed-in user's settings; `update` merges a patch and writes it back as account data. */
export function useUserSettings(): {
  settings: UserSettings;
  update(patch: Partial<UserSettings>): Promise<void>;
} {
  const { client } = useSession();
  const [settings, setSettings] = useState<UserSettings>(() =>
    client ? readSettings(client) : DEFAULT_SETTINGS,
  );

  useEffect(() => {
    if (!client) return;
    return watchSettings(client, setSettings);
  }, [client]);

  const update = useCallback(
    async (patch: Partial<UserSettings>) => {
      if (!client) return;
      const next = await writeSettings(client, patch);
      setSettings(next);
    },
    [client],
  );

  return { settings, update };
}

/** Publish the presence choice to the sync loop whenever the setting changes. */
export function usePresencePublisher(): void {
  const { client } = useSession();
  const { settings } = useUserSettings();
  useEffect(() => {
    if (!client) return;
    void applyPresence(client, settings).catch(() => undefined);
  }, [client, settings.sharePresence, settings]);
}

export interface PresenceInfo {
  presence: "online" | "unavailable" | "offline" | "unknown";
  /** Milliseconds since the user was last active, when the server reports it. */
  lastActiveAgo: number | null;
  currentlyActive: boolean;
}

function readPresence(user: User | null): PresenceInfo {
  if (!user || !user.events.presence) {
    return { presence: "unknown", lastActiveAgo: null, currentlyActive: false };
  }
  const p = user.presence;
  return {
    presence: p === "online" || p === "unavailable" || p === "offline" ? p : "unknown",
    lastActiveAgo:
      Number.isFinite(user.lastActiveAgo) && user.lastActiveAgo > 0 ? user.lastActiveAgo : null,
    currentlyActive: user.currentlyActive,
  };
}

/** Another user's presence as the server reports it (unknown when it does not). */
export function usePresence(userId: string | undefined): PresenceInfo {
  const { client } = useSession();
  const [info, setInfo] = useState<PresenceInfo>(() =>
    readPresence(client && userId ? client.getUser(userId) : null),
  );
  useEffect(() => {
    if (!client || !userId) return;
    const user = client.getUser(userId);
    if (!user) return;
    const refresh = () => setInfo(readPresence(user));
    refresh();
    user.on(UserEvent.Presence, refresh);
    user.on(UserEvent.CurrentlyActive, refresh);
    return () => {
      user.removeListener(UserEvent.Presence, refresh);
      user.removeListener(UserEvent.CurrentlyActive, refresh);
    };
  }, [client, userId]);
  return info;
}

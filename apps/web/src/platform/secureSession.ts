// Session persistence for the native apps (ADR-0006, TRD §4.2): the Matrix session record
// (tokens and identifiers, never the password or the recovery key) lives in platform secure
// storage, Android Keystore-encrypted preferences or the iOS Keychain, instead of the
// WebView's IndexedDB. The SDK's sync and crypto stores stay in IndexedDB (THREAT_MODEL TM-23).
import {
  KeychainAccess,
  SecureStorage,
  type SecureStoragePlugin,
} from "@aparajita/capacitor-secure-storage";
import { isStoredSession, type StoredSession } from "../matrix/sessionStore";

export interface SessionPersistence {
  loadSession(): Promise<StoredSession | null>;
  saveSession(s: StoredSession): Promise<void>;
  clearSession(): Promise<void>;
}

const KEY_PREFIX = "cs.";
const SESSION_KEY = "session";

export type SessionPlugin = Pick<
  SecureStoragePlugin,
  "setKeyPrefix" | "setSynchronize" | "get" | "set" | "remove"
>;

/**
 * A session store over the secure-storage plugin. Items never sync to iCloud and never
 * migrate to another device through backups (this-device-only access class), matching the
 * device-bound meaning of a Matrix session (TM-28).
 */
export function secureSessionStore(plugin: SessionPlugin = SecureStorage): SessionPersistence {
  let ready: Promise<void> | null = null;
  const init = () => {
    ready ??= (async () => {
      await plugin.setKeyPrefix(KEY_PREFIX);
      await plugin.setSynchronize(false);
    })();
    return ready;
  };
  return {
    async loadSession() {
      await init();
      const raw = await plugin.get(SESSION_KEY, false, false);
      return isStoredSession(raw) ? raw : null;
    },
    async saveSession(s) {
      await init();
      await plugin.set(
        SESSION_KEY,
        s as unknown as Record<string, unknown>,
        false,
        false,
        KeychainAccess.afterFirstUnlockThisDeviceOnly,
      );
    },
    async clearSession() {
      await init();
      await plugin.remove(SESSION_KEY, false);
    },
  };
}

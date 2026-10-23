// Persisted session for the web client: an app-owned IndexedDB record holding the
// Matrix session tokens and identifiers. Never localStorage (TRD §4.1): IndexedDB is
// still script-accessible within the origin, which is why the CSP is the real control
// and why this limitation is disclosed (THREAT_MODEL TM-11). The password is never stored.

export interface StoredSession {
  version: 1;
  homeserverUrl: string;
  userId: string;
  deviceId: string;
  accessToken: string;
  refreshToken?: string;
  /** Epoch ms when the access token expires, when the server told us. */
  accessTokenExpiresAt?: number;
  createdAt: number;
}

export class SessionStorageUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("Session storage (IndexedDB) is unavailable in this browser context");
    this.name = "SessionStorageUnavailableError";
    if (cause !== undefined) this.cause = cause;
  }
}

const DB_NAME = "cs-session";
const DB_VERSION = 1;
const STORE = "session";
const KEY = "current";

function factory(indexedDBFactory?: IDBFactory): IDBFactory {
  const f = indexedDBFactory ?? (typeof indexedDB !== "undefined" ? indexedDB : undefined);
  if (!f) throw new SessionStorageUnavailableError();
  return f;
}

function open(f: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let req: IDBOpenDBRequest;
    try {
      req = f.open(DB_NAME, DB_VERSION);
    } catch (e) {
      reject(new SessionStorageUnavailableError(e));
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new SessionStorageUnavailableError(req.error));
    req.onblocked = () => reject(new SessionStorageUnavailableError("blocked"));
  });
}

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error("IndexedDB request failed"));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
  indexedDBFactory?: IDBFactory,
): Promise<T> {
  const db = await open(factory(indexedDBFactory));
  try {
    const tx = db.transaction(STORE, mode);
    const result = await request(fn(tx.objectStore(STORE)));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
      tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
    });
    return result;
  } finally {
    db.close();
  }
}

function isStoredSession(v: unknown): v is StoredSession {
  if (!v || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  return (
    s.version === 1 &&
    typeof s.homeserverUrl === "string" &&
    typeof s.userId === "string" &&
    typeof s.deviceId === "string" &&
    typeof s.accessToken === "string" &&
    (s.refreshToken === undefined || typeof s.refreshToken === "string") &&
    (s.accessTokenExpiresAt === undefined || typeof s.accessTokenExpiresAt === "number") &&
    typeof s.createdAt === "number"
  );
}

/** Returns the stored session, or null when none (or an unreadable record) exists. */
export async function loadSession(indexedDBFactory?: IDBFactory): Promise<StoredSession | null> {
  const raw = await withStore("readonly", (s) => s.get(KEY), indexedDBFactory);
  return isStoredSession(raw) ? raw : null;
}

export async function saveSession(
  session: StoredSession,
  indexedDBFactory?: IDBFactory,
): Promise<void> {
  await withStore("readwrite", (s) => s.put(session, KEY), indexedDBFactory);
}

export async function clearSession(indexedDBFactory?: IDBFactory): Promise<void> {
  await withStore("readwrite", (s) => s.delete(KEY), indexedDBFactory);
}

/** Names of the IndexedDB databases this client creates for a device, for a full wipe on hard logout. */
export function deviceDatabaseNames(deviceId: string): string[] {
  return [
    `cs-sync-${deviceId}`,
    `cs-crypto-${deviceId}`,
    `cs-crypto-${deviceId}::matrix-sdk-crypto`,
  ];
}

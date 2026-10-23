// Shared setup for the Phase 2 integration tests: the web service layer (apps/web/src/matrix)
// driven from Node against a real homeserver. Gated by HOMESERVER_URL so `pnpm test` stays
// offline; `pnpm test:integration` with the compose Synapse running executes them.
import { randomBytes } from "node:crypto";
import { describe } from "vitest";
import { createClient, MatrixError, type MatrixClient } from "matrix-js-sdk";
import { login, register } from "../../src/matrix/auth";
import { createMatrixClient, startSync } from "../../src/matrix/client";
import type { SecretStorageKeyHolder } from "../../src/matrix/recoveryKey";
import type { StoredSession } from "../../src/matrix/sessionStore";

export const HOMESERVER_URL = process.env.HOMESERVER_URL ?? "";
/** Set by CI to the configured access-token lifetime so expiry can be exercised. */
export const ACCESS_TOKEN_LIFETIME_MS = Number(process.env.ACCESS_TOKEN_LIFETIME_MS ?? 0);

export const describeIntegration = describe.skipIf(!HOMESERVER_URL);

/** One throwaway password per run; never a real credential. */
export const TEST_PASSWORD = `it-${randomBytes(12).toString("base64url")}`;

export function uniqueUsername(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;
}

export interface Account {
  username: string;
  password: string;
  session: StoredSession;
}

export async function newAccount(prefix = "it", deviceName = "Test device A"): Promise<Account> {
  const username = uniqueUsername(prefix);
  const session = await register(HOMESERVER_URL, { username, password: TEST_PASSWORD }, deviceName);
  return { username, password: TEST_PASSWORD, session };
}

export function loginAgain(acct: Account, deviceName: string): Promise<StoredSession> {
  return login(HOMESERVER_URL, { username: acct.username, password: acct.password }, deviceName);
}

const clients = new Set<MatrixClient>();

/** A syncing client with the Rust crypto backend (memory stores), tracked for cleanup. */
export async function deviceClient(
  session: StoredSession,
  holder?: SecretStorageKeyHolder,
): Promise<MatrixClient> {
  const client = await createMatrixClient({
    session,
    onTokenRefresh: () => {},
    ...(holder ? { cryptoCallbacks: holder.callbacks() } : {}),
    sdkLogLevel: "silent",
  });
  clients.add(client);
  await startSync(client, { pollTimeout: 10_000, firstSyncTimeoutMs: 30_000 });
  return client;
}

/** A client that only makes authenticated HTTP calls (no sync, no crypto). */
export function plainClient(session: Pick<StoredSession, "accessToken" | "userId" | "deviceId">) {
  return createClient({
    baseUrl: HOMESERVER_URL,
    accessToken: session.accessToken,
    userId: session.userId,
    deviceId: session.deviceId,
    useAuthorizationHeader: true,
  });
}

export async function stopClients(): Promise<void> {
  for (const c of clients) {
    c.stopClient();
    await c.clearStores().catch(() => undefined);
  }
  clients.clear();
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function waitFor<T>(
  label: string,
  predicate: () => T | Promise<T>,
  timeoutMs = 60_000,
): Promise<NonNullable<T>> {
  const start = Date.now();
  for (;;) {
    const value = await predicate();
    if (value) return value as NonNullable<T>;
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for: ${label}`);
    await sleep(250);
  }
}

/** Run an authenticated request and return the MatrixError the server answered with, if any. */
export async function errorOf(p: Promise<unknown>): Promise<MatrixError | null> {
  try {
    await p;
    return null;
  } catch (e) {
    if (e instanceof MatrixError) return e;
    throw e;
  }
}

export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(label)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

// On-device spike (ADR-0001 C2, ADR-0006): proves, inside the platform WebView, that the
// Rust crypto WebAssembly loads, a throwaway account can be registered and set up, an
// encrypted message from a peer is decrypted and answered, the crypto and sync stores
// survive a force-stop and relaunch, the session is restored from native secure storage,
// and a revoked device is noticed. Results are printed as `CS_SPIKE <check> PASS|FAIL`
// lines (collected from logcat / the simulator console) and shown on screen for a manual
// run on a phone. Built only with VITE_MOBILE_SPIKE=1; absent from production bundles.
import type { WebEnv } from "../config/env";
import { register } from "../matrix/auth";
import { createMatrixClient, onSessionLoggedOut, startSync } from "../matrix/client";
import { ensureCryptoReady } from "../matrix/cryptoSetup";
import { revokeDevice } from "../matrix/devices";
import { SecretStorageKeyHolder } from "../matrix/recoveryKey";
import { acceptInvite, listDirectConversations } from "../matrix/rooms";
import { sendText, timelineItems } from "../matrix/timeline";
import { nativePlatform } from "../platform/native";
import type { SessionPersistence } from "../platform/secureSession";

/** Spike-only bookkeeping (throwaway account; never used by the real app). */
const MARKER_KEY = "cs.spike.marker";
interface Marker {
  ed25519: string;
  roomId: string;
  password: string;
  peerBody: string;
}

const PHASE1 = [
  "web_locks",
  "secure_storage",
  "wasm_crypto",
  "crypto_setup",
  "sync",
  "encrypt_decrypt",
  "reply_sent",
] as const;
const PHASE2 = [
  "session_restores",
  "store_persists",
  "history_persists",
  "revocation",
  "secure_storage_cleared",
] as const;
export const REQUIRED_CHECKS = [...PHASE1, ...PHASE2];

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitFor<T>(
  what: string,
  fn: () => T | Promise<T>,
  timeoutMs: number,
): Promise<NonNullable<T>> {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v as NonNullable<T>;
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${what}`);
    await sleep(500);
  }
}

function nonce(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

class Reporter {
  private readonly pre: HTMLPreElement;
  constructor(root: HTMLElement) {
    root.innerHTML = "";
    const h = document.createElement("h1");
    h.textContent = "Communication System — device spike";
    this.pre = document.createElement("pre");
    this.pre.style.whiteSpace = "pre-wrap";
    root.append(h, this.pre);
  }
  line(text: string): void {
    console.log(text);
    this.pre.textContent += `${text}\n`;
  }
  check(name: string, ok: boolean, detail = ""): void {
    this.line(`CS_SPIKE ${name} ${ok ? "PASS" : "FAIL"} ${detail}`.trimEnd());
  }
}

export async function runSpike(
  env: WebEnv,
  sessions: SessionPersistence,
  root: HTMLElement,
): Promise<void> {
  const out = new Reporter(root);
  const platform = nativePlatform();
  out.line(
    `CS_SPIKE info platform=${platform} homeserver=${env.homeserverUrl} ua=${navigator.userAgent}`,
  );
  const stored = await sessions.loadSession().catch((e: unknown) => {
    out.check("secure_storage", false, `load failed: ${String(e)}`);
    return null;
  });
  try {
    if (stored) await phase2(env, sessions, out, stored.deviceId, stored.userId, stored);
    else await phase1(env, sessions, out, platform);
  } catch (e) {
    out.line(`CS_SPIKE error ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`);
    out.line("CS_SPIKE phase ABORTED");
  }
}

async function phase1(
  env: WebEnv,
  sessions: SessionPersistence,
  out: Reporter,
  platform: string,
): Promise<void> {
  out.check("web_locks", typeof navigator.locks !== "undefined", "navigator.locks");

  const id = nonce();
  const creds = { username: `spike-${platform}-${id}`, password: `Spike-${nonce()}-${nonce()}` };
  const session = await register(env.homeserverUrl, creds, `Spike ${platform}`);
  await sessions.saveSession(session);
  const back = await sessions.loadSession();
  out.check(
    "secure_storage",
    back?.accessToken === session.accessToken && back.deviceId === session.deviceId,
    "session round-trip",
  );

  const holder = new SecretStorageKeyHolder();
  const client = await createMatrixClient({
    session,
    onTokenRefresh: () => {},
    cryptoCallbacks: holder.callbacks(),
    sdkLogLevel: "warn",
  });
  const crypto = client.getCrypto();
  const keys = crypto ? await crypto.getOwnDeviceKeys() : null;
  out.check(
    "wasm_crypto",
    Boolean(keys?.ed25519),
    keys ? `ed25519=${keys.ed25519.slice(0, 8)}…` : "no crypto backend",
  );
  if (!keys) return;

  const outcome = await ensureCryptoReady(client, holder, {
    requestPassword: async () => creds.password,
    requestRecoveryKey: async () => null,
    showRecoveryKey: async () => {},
  });
  out.check(
    "crypto_setup",
    outcome.outcome === "created" || outcome.outcome === "already_ready",
    outcome.outcome,
  );

  await startSync(client);
  out.check("sync", true, "first live sync");
  out.line(`CS_SPIKE account ${session.userId}`);
  out.line("Waiting for an invitation and an encrypted message from a peer (3 minutes)…");

  const invite = await waitFor(
    "invitation",
    () => listDirectConversations(client).find((c) => c.membership === "invite"),
    180_000,
  );
  await acceptInvite(client, invite.roomId);
  const room = await waitFor("room", () => client.getRoom(invite.roomId), 30_000);
  const incoming = await waitFor(
    "peer message",
    () => timelineItems(room, session.userId).find((i) => i.kind === "text" && !i.mine),
    120_000,
  );
  const body = (incoming as { body: string }).body;
  out.check("encrypt_decrypt", true, `decrypted "${body}"`);

  await sendText(client, invite.roomId, `pong ${body}`);
  await waitFor(
    "reply accepted",
    () =>
      timelineItems(room, session.userId).find(
        (i) => i.kind === "text" && i.mine && i.status === "sent",
      ),
    60_000,
  );
  out.check("reply_sent", true, "encrypted reply accepted by the server");

  const marker: Marker = {
    ed25519: keys.ed25519,
    roomId: invite.roomId,
    password: creds.password,
    peerBody: body,
  };
  localStorage.setItem(MARKER_KEY, JSON.stringify(marker));
  out.line("CS_SPIKE phase1 DONE — force-stop and relaunch the app for phase 2");
}

async function phase2(
  env: WebEnv,
  sessions: SessionPersistence,
  out: Reporter,
  deviceId: string,
  userId: string,
  session: NonNullable<Awaited<ReturnType<SessionPersistence["loadSession"]>>>,
): Promise<void> {
  const raw = localStorage.getItem(MARKER_KEY);
  const marker = raw ? (JSON.parse(raw) as Marker) : null;
  const holder = new SecretStorageKeyHolder();
  const client = await createMatrixClient({
    session,
    onTokenRefresh: () => {},
    cryptoCallbacks: holder.callbacks(),
    sdkLogLevel: "warn",
  });
  let loggedOut: { softLogout: boolean } | null = null;
  onSessionLoggedOut(client, (info) => {
    loggedOut = info;
  });
  await startSync(client);
  out.check(
    "session_restores",
    client.getUserId() === userId,
    `${userId} / ${deviceId} syncing after relaunch`,
  );

  const keys = await client.getCrypto()?.getOwnDeviceKeys();
  out.check(
    "store_persists",
    Boolean(marker && keys && keys.ed25519 === marker.ed25519),
    marker
      ? `ed25519 ${keys?.ed25519 === marker.ed25519 ? "unchanged" : "CHANGED"}`
      : "no phase-1 marker",
  );

  if (marker) {
    const room = await waitFor(
      "room from store",
      () => client.getRoom(marker.roomId),
      30_000,
    ).catch(() => null);
    // Cached timelines decrypt asynchronously after a restart and may be short; the app
    // pages older history the same way, so allow one scrollback before judging.
    const findPeer = () =>
      room
        ? timelineItems(room, userId).find(
            (i) => i.kind === "text" && !i.mine && (i as { body: string }).body === marker.peerBody,
          )
        : undefined;
    let item = await waitFor("decrypted peer message", findPeer, 20_000).catch(() => undefined);
    if (!item && room) {
      await client.scrollback(room, 30).catch(() => undefined);
      item = await waitFor("peer message after scrollback", findPeer, 20_000).catch(
        () => undefined,
      );
    }
    out.check(
      "history_persists",
      Boolean(item),
      item ? "peer message decrypted again from the persisted stores" : "message not found",
    );

    await revokeDevice(client, deviceId, async () => marker.password);
    await waitFor("logged-out signal", () => loggedOut, 90_000).catch(() => null);
    out.check(
      "revocation",
      loggedOut !== null,
      loggedOut
        ? `server rejected the token (soft=${String((loggedOut as { softLogout: boolean }).softLogout)})`
        : "no logged-out signal within 90 s",
    );
  }

  await sessions.clearSession();
  out.check("secure_storage_cleared", (await sessions.loadSession()) === null, "session removed");
  localStorage.removeItem(MARKER_KEY);
  out.line("CS_SPIKE phase2 DONE");
}

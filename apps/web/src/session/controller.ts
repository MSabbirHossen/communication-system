// Session state machine for the web client (APP_FLOW 5.1/5.2). Framework-free so it can
// be unit-tested with faked dependencies; SessionProvider adapts it to React.
//
// Token lifecycle: matrix-js-sdk 44 refreshes tokens itself only for OAuth2 sessions, so
// native Matrix refresh tokens (MSC2918, what Synapse issues for password logins) are
// driven here: proactively shortly before the access token expires, and reactively when
// the SDK reports a soft logout. See ADR-0003.
import type { Credentials } from "../matrix/auth";
import type { CryptoCallbacks, MatrixClient, TokenUpdate } from "../matrix/client";
import type { CryptoReadiness, SetupOutcome, SetupPrompts, SetupStep } from "../matrix/cryptoSetup";
import { AuthFailure, toAuthError, type AuthError } from "../matrix/errors";
import type { SecretStorageKeyHolder } from "../matrix/recoveryKey";
import { InvalidRecoveryKeyError } from "../matrix/recoveryKey";
import type { StoredSession } from "../matrix/sessionStore";
import { UiaCancelled } from "../matrix/uia";
import type { WebLogger } from "../lib/logger";
import { Deferred } from "./deferred";

export type SessionStatus =
  | "booting" // reading the persisted session
  | "signed_out" // no session; show Welcome/Login/Register
  | "authenticating" // login/register request in flight
  | "starting" // client created, sync starting
  | "crypto_setup" // signed in; secure device setup needs the user (APP_FLOW 5.1 E/F)
  | "ready" // client syncing, encryption ready; app usable
  | "error"; // unrecoverable startup error (e.g. storage unavailable)

/** What the secure-device-setup screen should show. */
export type SetupUi =
  | { phase: "idle" }
  | { phase: "working"; step: SetupStep }
  | { phase: "need_password"; error: AuthError | null }
  | { phase: "need_recovery_key"; attempt: number; invalid: boolean }
  | { phase: "show_recovery_key"; key: string }
  | { phase: "done"; outcome: SetupOutcome }
  | { phase: "failed"; error: AuthError };

export interface SessionState {
  status: SessionStatus;
  session: StoredSession | null;
  client: MatrixClient | null;
  /** Last auth/startup error, for the screens to render. */
  error: AuthError | null;
  setup: SetupUi;
}

export interface SessionDeps {
  homeserverUrl: string;
  logger: WebLogger;
  keyHolder: SecretStorageKeyHolder;
  loadSession(): Promise<StoredSession | null>;
  saveSession(s: StoredSession): Promise<void>;
  clearSession(): Promise<void>;
  login(homeserverUrl: string, creds: Credentials): Promise<StoredSession>;
  register(homeserverUrl: string, creds: Credentials): Promise<StoredSession>;
  refreshSession(session: StoredSession): Promise<StoredSession>;
  logoutRemote(client: MatrixClient): Promise<void>;
  createMatrixClient(opts: {
    session: StoredSession;
    onTokenRefresh: (t: TokenUpdate) => void;
    cryptoCallbacks: CryptoCallbacks;
  }): Promise<MatrixClient>;
  startSync(client: MatrixClient): Promise<void>;
  restartSync(client: MatrixClient): Promise<void>;
  applyAccessToken(client: MatrixClient, accessToken: string): void;
  onSessionLoggedOut(client: MatrixClient, cb: (info: { softLogout: boolean }) => void): () => void;
  stopAndClearClient(client: MatrixClient): Promise<void>;
  getCryptoReadiness(client: MatrixClient): Promise<CryptoReadiness>;
  ensureCryptoReady(
    client: MatrixClient,
    holder: SecretStorageKeyHolder,
    prompts: SetupPrompts,
  ): Promise<SetupOutcome>;
  /** Injectable clock for tests. */
  now?: () => number;
}

type Listener = () => void;

/** Refresh this long before the access token expires. */
const REFRESH_MARGIN_MS = 60_000;
/** Retry a failed (network) refresh after this long. */
const REFRESH_RETRY_MS = 30_000;

export class SessionController {
  private state: SessionState = {
    status: "booting",
    session: null,
    client: null,
    error: null,
    setup: { phase: "idle" },
  };
  private readonly listeners = new Set<Listener>();
  private booted = false;
  private setupRunning = false;
  private passwordPrompt: Deferred<string> | null = null;
  private recoveryKeyPrompt: Deferred<string | null> | null = null;
  private recoveryKeyAck: Deferred<void> | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private refreshing: Promise<boolean> | null = null;
  private unsubscribeLoggedOut: (() => void) | null = null;

  constructor(private readonly deps: SessionDeps) {}

  // --- store contract for useSyncExternalStore -------------------------------
  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getSnapshot = (): SessionState => this.state;

  private set(patch: Partial<SessionState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  private now(): number {
    return this.deps.now ? this.deps.now() : Date.now();
  }

  // --- lifecycle ---------------------------------------------------------------
  /** Restore a persisted session if there is one. Idempotent (StrictMode mounts effects twice). */
  async boot(): Promise<void> {
    if (this.booted) return;
    this.booted = true;
    try {
      const stored = await this.deps.loadSession();
      if (!stored) {
        this.set({ status: "signed_out", session: null, client: null, error: null });
        return;
      }
      await this.start(stored);
    } catch (err) {
      await this.failStart(err, "session boot failed");
    }
  }

  async signIn(creds: Credentials): Promise<void> {
    await this.authenticate(() => this.deps.login(this.deps.homeserverUrl, creds));
  }

  async signUp(creds: Credentials): Promise<void> {
    await this.authenticate(() => this.deps.register(this.deps.homeserverUrl, creds));
  }

  /** Sign out of this device: server-side logout, then wipe every local store. */
  async signOut(): Promise<void> {
    this.abortPrompts();
    const { client } = this.state;
    if (client) {
      try {
        await this.deps.logoutRemote(client);
      } catch (err) {
        // A failed remote logout must not keep the user signed in locally.
        this.deps.logger.warn("remote logout failed; clearing local session anyway", {
          code: toAuthError(err).code,
        });
      }
    }
    await this.dropSession(null);
  }

  /** Clear a transient error so forms can retry. */
  clearError(): void {
    if (this.state.error) this.set({ error: null });
  }

  // --- secure device setup -------------------------------------------------------
  /** Start (or resume) the interactive setup. Called by the setup screen; idempotent. */
  async runSetup(): Promise<void> {
    const { client, status } = this.state;
    if (!client || status !== "crypto_setup" || this.setupRunning) return;
    this.setupRunning = true;
    const prompts: SetupPrompts = {
      onStep: (step) => this.set({ setup: { phase: "working", step } }),
      requestPassword: () => {
        this.passwordPrompt = new Deferred<string>();
        this.set({ setup: { phase: "need_password", error: null } });
        return this.passwordPrompt.promise;
      },
      requestRecoveryKey: (attempt) => {
        this.recoveryKeyPrompt = new Deferred<string | null>();
        this.set({ setup: { phase: "need_recovery_key", attempt, invalid: attempt > 1 } });
        return this.recoveryKeyPrompt.promise;
      },
      showRecoveryKey: (key) => {
        this.recoveryKeyAck = new Deferred<void>();
        this.set({ setup: { phase: "show_recovery_key", key } });
        return this.recoveryKeyAck.promise;
      },
    };
    try {
      const outcome = await this.deps.ensureCryptoReady(client, this.deps.keyHolder, prompts);
      this.deps.logger.info("secure device setup finished", { outcome: outcome.outcome });
      this.set({ status: "ready", setup: { phase: "done", outcome } });
    } catch (err) {
      const error =
        err instanceof UiaCancelled
          ? ({ code: "unknown", detail: "setup cancelled" } as AuthError)
          : err instanceof InvalidRecoveryKeyError
            ? ({ code: "unknown", detail: "invalid recovery key" } as AuthError)
            : toAuthError(err);
      this.deps.logger.warn("secure device setup failed", {
        code: error.code,
        detail: error.detail,
      });
      this.set({ setup: { phase: "failed", error } });
    } finally {
      this.setupRunning = false;
      this.passwordPrompt = null;
      this.recoveryKeyPrompt = null;
      this.recoveryKeyAck = null;
    }
  }

  retrySetup(): void {
    if (this.state.setup.phase === "failed") this.set({ setup: { phase: "idle" } });
    void this.runSetup();
  }

  submitSetupPassword(password: string): void {
    this.passwordPrompt?.resolve(password);
    this.passwordPrompt = null;
    this.set({ setup: { phase: "working", step: "cross_signing" } });
  }

  cancelSetupPassword(): void {
    this.passwordPrompt?.reject(new UiaCancelled());
    this.passwordPrompt = null;
  }

  submitRecoveryKey(key: string): void {
    this.recoveryKeyPrompt?.resolve(key);
    this.recoveryKeyPrompt = null;
    this.set({ setup: { phase: "working", step: "restoring" } });
  }

  skipRecoveryKey(): void {
    this.recoveryKeyPrompt?.resolve(null);
    this.recoveryKeyPrompt = null;
  }

  acknowledgeRecoveryKey(): void {
    this.recoveryKeyAck?.resolve();
    this.recoveryKeyAck = null;
    this.set({ setup: { phase: "working", step: "key_backup" } });
  }

  private abortPrompts(): void {
    this.passwordPrompt?.reject(new UiaCancelled());
    this.recoveryKeyPrompt?.resolve(null);
    this.recoveryKeyAck?.resolve();
  }

  // --- token refresh -------------------------------------------------------------
  /** Refresh now (deduplicated). Resolves true when the session has a fresh token. */
  refreshNow(): Promise<boolean> {
    if (this.refreshing) return this.refreshing;
    this.refreshing = this.doRefresh().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async doRefresh(): Promise<boolean> {
    const current = this.state.session;
    if (!current?.refreshToken) return false;
    try {
      const next = await this.deps.refreshSession(current);
      await this.deps.saveSession(next);
      if (this.state.client) this.deps.applyAccessToken(this.state.client, next.accessToken);
      this.set({ session: next });
      this.deps.logger.debug("access token refreshed", { expiresAt: next.accessTokenExpiresAt });
      this.scheduleRefresh();
      return true;
    } catch (err) {
      const error = err instanceof AuthFailure ? err.error : toAuthError(err);
      if (error.code === "session_expired" || error.code === "invalid_credentials") {
        this.deps.logger.warn("refresh token rejected; signing out", { code: error.code });
        await this.dropSession({ code: "session_expired", detail: error.detail });
        return false;
      }
      this.deps.logger.warn("token refresh failed; will retry", { code: error.code });
      this.clearRefreshTimer();
      this.refreshTimer = setTimeout(() => void this.refreshNow(), REFRESH_RETRY_MS);
      return false;
    }
  }

  private scheduleRefresh(): void {
    this.clearRefreshTimer();
    const s = this.state.session;
    if (!s?.refreshToken || !s.accessTokenExpiresAt) return;
    const delay = Math.max(5_000, s.accessTokenExpiresAt - this.now() - REFRESH_MARGIN_MS);
    this.refreshTimer = setTimeout(() => void this.refreshNow(), delay);
  }

  private clearRefreshTimer(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
  }

  private isExpiringSoon(s: StoredSession): boolean {
    return (
      s.accessTokenExpiresAt !== undefined &&
      s.accessTokenExpiresAt - this.now() < REFRESH_MARGIN_MS
    );
  }

  /** The SDK reports the token is no longer accepted. */
  private async handleLoggedOut(info: { softLogout: boolean }): Promise<void> {
    const { client, session } = this.state;
    if (!client || !session) return;
    if (info.softLogout && session.refreshToken) {
      this.deps.logger.info("session soft-logged out; refreshing token");
      if (await this.refreshNow()) await this.deps.restartSync(client);
      return; // otherwise doRefresh already dropped the session or scheduled a retry
    }
    this.deps.logger.warn("session logged out by the server", { soft: info.softLogout });
    await this.dropSession({ code: "session_expired" });
  }

  // --- internals -----------------------------------------------------------------
  private async authenticate(run: () => Promise<StoredSession>): Promise<void> {
    this.set({ status: "authenticating", error: null });
    let session: StoredSession;
    try {
      session = await run();
    } catch (err) {
      const error = err instanceof AuthFailure ? err.error : toAuthError(err);
      this.deps.logger.warn("authentication failed", { code: error.code });
      this.set({ status: "signed_out", error });
      return;
    }
    await this.deps.saveSession(session);
    try {
      await this.start(session);
    } catch (err) {
      await this.failStart(err, "session start failed after authentication");
    }
  }

  private async start(stored: StoredSession): Promise<void> {
    let session = stored;
    this.set({ status: "starting", session, error: null, setup: { phase: "idle" } });

    // An access token about to expire (or already expired) is refreshed before use.
    if (session.refreshToken && this.isExpiringSoon(session)) {
      try {
        session = await this.deps.refreshSession(session);
        await this.deps.saveSession(session);
        this.set({ session });
      } catch (err) {
        const error = err instanceof AuthFailure ? err.error : toAuthError(err);
        if (error.code === "session_expired" || error.code === "invalid_credentials") {
          await this.dropSession({ code: "session_expired", detail: error.detail });
          return;
        }
        throw err; // network: surface as a start error; the stored session stays
      }
    }

    const client = await this.deps.createMatrixClient({
      session,
      onTokenRefresh: (t) => void this.persistTokens(t),
      cryptoCallbacks: this.deps.keyHolder.callbacks(),
    });
    this.unsubscribeLoggedOut?.();
    this.unsubscribeLoggedOut = this.deps.onSessionLoggedOut(client, (info) => {
      void this.handleLoggedOut(info);
    });
    this.set({ client });
    this.scheduleRefresh();

    try {
      await this.deps.startSync(client);
    } catch (err) {
      if (toAuthError(err).code === "session_expired" && session.refreshToken) {
        if (await this.refreshNow()) await this.deps.restartSync(client);
        if (this.state.status !== "starting") return; // dropped during refresh
      } else {
        throw err;
      }
    }

    const readiness = await this.deps.getCryptoReadiness(client);
    if (readiness.crossSigningReady && readiness.secretStorageReady) {
      this.set({ status: "ready" });
      this.deps.logger.info("session ready", { deviceId: session.deviceId });
    } else {
      this.set({ status: "crypto_setup" });
      this.deps.logger.info("secure device setup required", {
        deviceId: session.deviceId,
        accountHasCrossSigning: readiness.accountHasCrossSigning,
      });
    }
  }

  private async failStart(err: unknown, message: string): Promise<void> {
    const error = toAuthError(err);
    this.deps.logger.error(message, {
      code: error.code,
      message: err instanceof Error ? err.message : String(err),
    });
    if (error.code === "session_expired") {
      await this.dropSession(error);
      return;
    }
    this.set({ status: "error", error });
  }

  /** Forget this device's session: stop the client, wipe SDK stores, clear the record. */
  private async dropSession(error: AuthError | null): Promise<void> {
    this.clearRefreshTimer();
    this.unsubscribeLoggedOut?.();
    this.unsubscribeLoggedOut = null;
    const { client } = this.state;
    if (client) await this.deps.stopAndClearClient(client);
    await this.deps.clearSession();
    this.deps.keyHolder.clear();
    this.set({
      status: "signed_out",
      session: null,
      client: null,
      error,
      setup: { phase: "idle" },
    });
  }

  private async persistTokens(t: TokenUpdate): Promise<void> {
    const current = this.state.session;
    if (!current) return;
    const next: StoredSession = { ...current, accessToken: t.accessToken };
    if (t.refreshToken) next.refreshToken = t.refreshToken;
    if (t.accessTokenExpiresAt) next.accessTokenExpiresAt = t.accessTokenExpiresAt;
    await this.deps.saveSession(next);
    this.set({ session: next });
    this.scheduleRefresh();
  }
}

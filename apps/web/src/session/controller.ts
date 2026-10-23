// Session state machine for the web client (APP_FLOW 5.1/5.2). Framework-free so it can
// be unit-tested with faked dependencies; SessionProvider adapts it to React.
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
  logoutRemote(client: MatrixClient): Promise<void>;
  createMatrixClient(opts: {
    session: StoredSession;
    onTokenRefresh: (t: TokenUpdate) => void;
    cryptoCallbacks: CryptoCallbacks;
  }): Promise<MatrixClient>;
  startSync(client: MatrixClient): Promise<void>;
  stopAndClearClient(client: MatrixClient): Promise<void>;
  getCryptoReadiness(client: MatrixClient): Promise<CryptoReadiness>;
  ensureCryptoReady(
    client: MatrixClient,
    holder: SecretStorageKeyHolder,
    prompts: SetupPrompts,
  ): Promise<SetupOutcome>;
}

type Listener = () => void;

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
      this.deps.logger.error("session boot failed", {
        code: toAuthError(err).code,
        message: err instanceof Error ? err.message : String(err),
      });
      this.set({ status: "error", error: toAuthError(err) });
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
      await this.deps.stopAndClearClient(client);
    }
    await this.deps.clearSession();
    this.deps.keyHolder.clear();
    this.set({
      status: "signed_out",
      session: null,
      client: null,
      error: null,
      setup: { phase: "idle" },
    });
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
      // The account exists and the session is stored; starting the client failed (e.g. the
      // crypto module could not load). Surface it instead of hanging in "starting".
      const error = toAuthError(err);
      this.deps.logger.error("session start failed after authentication", {
        code: error.code,
        message: err instanceof Error ? err.message : String(err),
      });
      this.set({ status: "error", error });
    }
  }

  private async start(session: StoredSession): Promise<void> {
    this.set({ status: "starting", session, error: null, setup: { phase: "idle" } });
    const client = await this.deps.createMatrixClient({
      session,
      onTokenRefresh: (t) => void this.persistTokens(t),
      cryptoCallbacks: this.deps.keyHolder.callbacks(),
    });
    await this.deps.startSync(client);
    const readiness = await this.deps.getCryptoReadiness(client);
    if (readiness.crossSigningReady && readiness.secretStorageReady) {
      this.set({ status: "ready", client });
      this.deps.logger.info("session ready", { deviceId: session.deviceId });
    } else {
      this.set({ status: "crypto_setup", client });
      this.deps.logger.info("secure device setup required", {
        deviceId: session.deviceId,
        accountHasCrossSigning: readiness.accountHasCrossSigning,
      });
    }
  }

  private async persistTokens(t: TokenUpdate): Promise<void> {
    const current = this.state.session;
    if (!current) return;
    const next: StoredSession = { ...current, accessToken: t.accessToken };
    if (t.refreshToken) next.refreshToken = t.refreshToken;
    if (t.accessTokenExpiresAt) next.accessTokenExpiresAt = t.accessTokenExpiresAt;
    await this.deps.saveSession(next);
    this.set({ session: next });
  }
}

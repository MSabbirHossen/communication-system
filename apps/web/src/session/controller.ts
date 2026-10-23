// Session state machine for the web client (APP_FLOW 5.1/5.2). Framework-free so it can
// be unit-tested with faked dependencies; SessionProvider adapts it to React.
import type { Credentials } from "../matrix/auth";
import type { MatrixClient, TokenUpdate } from "../matrix/client";
import { AuthFailure, toAuthError, type AuthError } from "../matrix/errors";
import type { StoredSession } from "../matrix/sessionStore";
import type { WebLogger } from "../lib/logger";

export type SessionStatus =
  | "booting" // reading the persisted session
  | "signed_out" // no session; show Welcome/Login/Register
  | "authenticating" // login/register request in flight
  | "starting" // client created, sync starting
  | "ready" // client syncing; app usable
  | "error"; // unrecoverable startup error (e.g. storage unavailable)

export interface SessionState {
  status: SessionStatus;
  session: StoredSession | null;
  client: MatrixClient | null;
  /** Last auth/startup error, for the screens to render. */
  error: AuthError | null;
}

export interface SessionDeps {
  homeserverUrl: string;
  logger: WebLogger;
  loadSession(): Promise<StoredSession | null>;
  saveSession(s: StoredSession): Promise<void>;
  clearSession(): Promise<void>;
  login(homeserverUrl: string, creds: Credentials): Promise<StoredSession>;
  register(homeserverUrl: string, creds: Credentials): Promise<StoredSession>;
  logoutRemote(client: MatrixClient): Promise<void>;
  createMatrixClient(opts: {
    session: StoredSession;
    onTokenRefresh: (t: TokenUpdate) => void;
  }): Promise<MatrixClient>;
  startSync(client: MatrixClient): Promise<void>;
  stopAndClearClient(client: MatrixClient): Promise<void>;
}

type Listener = () => void;

export class SessionController {
  private state: SessionState = { status: "booting", session: null, client: null, error: null };
  private readonly listeners = new Set<Listener>();

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
  private booted = false;

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
      this.deps.logger.error("session boot failed", { code: toAuthError(err).code });
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
    this.set({ status: "signed_out", session: null, client: null, error: null });
  }

  /** Clear a transient error so forms can retry. */
  clearError(): void {
    if (this.state.error) this.set({ error: null });
  }

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
    await this.start(session);
  }

  private async start(session: StoredSession): Promise<void> {
    this.set({ status: "starting", session, error: null });
    const client = await this.deps.createMatrixClient({
      session,
      onTokenRefresh: (t) => void this.persistTokens(t),
    });
    await this.deps.startSync(client);
    this.set({ status: "ready", client });
    this.deps.logger.info("session ready", { deviceId: session.deviceId });
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

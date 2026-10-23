// Test helpers: a SessionController with faked dependencies, and a render wrapper.
import { render } from "@testing-library/react";
import { RouterProvider } from "react-router";
import { vi } from "vitest";
import type { MatrixClient } from "../matrix/client";
import type { StoredSession } from "../matrix/sessionStore";
import { SecretStorageKeyHolder } from "../matrix/recoveryKey";
import { createTestRouter } from "../routes";
import { SessionController, type SessionDeps } from "../session/controller";
import { SessionProvider } from "../session/SessionProvider";
import { SecurityProvider, type SecurityDeps } from "../session/security";
import { ThemeProvider } from "../shell/ThemeProvider";

export const testSession: StoredSession = {
  version: 1,
  homeserverUrl: "http://localhost:8008",
  userId: "@alice:localhost",
  deviceId: "DEVTEST",
  accessToken: "syt_test_token",
  refreshToken: "syr_test_token",
  createdAt: 0,
};

export const fakeClient = () =>
  ({
    getUserId: () => testSession.userId,
    getDeviceId: () => testSession.deviceId,
  }) as unknown as MatrixClient;

export const silentLogger = () => {
  const l = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), child: vi.fn() };
  l.child.mockReturnValue(l);
  return l;
};

/** Faked dependencies; override any to script a scenario. */
export function fakeDeps(overrides: Partial<SessionDeps> = {}): SessionDeps {
  const deps: SessionDeps = {
    homeserverUrl: "http://localhost:8008",
    logger: silentLogger() as unknown as SessionDeps["logger"],
    keyHolder: new SecretStorageKeyHolder(),
    getCryptoReadiness: vi.fn(async () => ({
      crossSigningReady: true,
      secretStorageReady: true,
      keyBackupEnabled: true,
      accountHasCrossSigning: true,
    })),
    ensureCryptoReady: vi.fn(async () => ({ outcome: "already_ready" as const })),
    loadSession: vi.fn(async () => null),
    saveSession: vi.fn(async () => {}),
    clearSession: vi.fn(async () => {}),
    login: vi.fn(async () => testSession),
    register: vi.fn(async () => testSession),
    refreshSession: vi.fn(async (s: StoredSession) => ({
      ...s,
      accessToken: "syt_refreshed",
      refreshToken: "syr_refreshed",
      accessTokenExpiresAt: Date.now() + 300_000,
    })),
    logoutRemote: vi.fn(async () => {}),
    restartSync: vi.fn(async () => {}),
    applyAccessToken: vi.fn(),
    onSessionLoggedOut: vi.fn(() => () => {}),
    createMatrixClient: vi.fn(async () => fakeClient()),
    startSync: vi.fn(async () => {}),
    stopAndClearClient: vi.fn(async () => {}),
    ...overrides,
  };
  return deps;
}

/** A controller already in the given state (ready = restored session). */
export async function controllerIn(
  status: "signed_out" | "ready",
  overrides: Partial<SessionDeps> = {},
): Promise<SessionController> {
  const deps = fakeDeps({
    loadSession: vi.fn(async () => (status === "ready" ? testSession : null)),
    ...overrides,
  });
  const c = new SessionController(deps);
  await c.boot();
  return c;
}

/** Security deps that never emit; override to script notices or verification flows. */
export function fakeSecurityDeps(overrides: Partial<SecurityDeps> = {}): SecurityDeps {
  return {
    watchSecurityEvents: vi.fn(() => () => {}),
    watchIncomingVerification: vi.fn(() => () => {}),
    requestVerification: vi.fn(async () => {
      throw new Error("requestVerification not faked");
    }),
    ...overrides,
  };
}

export function renderApp(
  path: string,
  controller: SessionController,
  security: SecurityDeps = fakeSecurityDeps(),
) {
  return render(
    <ThemeProvider>
      <SessionProvider controller={controller}>
        <SecurityProvider deps={security}>
          <RouterProvider router={createTestRouter([path])} />
        </SecurityProvider>
      </SessionProvider>
    </ThemeProvider>,
  );
}

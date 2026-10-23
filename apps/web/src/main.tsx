import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import "./styles/global.css";
import { loadWebEnv } from "./config/env";
import { setLocale } from "./i18n";
import { makeLogger } from "./lib/logger";
import { login, logoutRemote, refreshSession, register } from "./matrix/auth";
import {
  applyAccessToken,
  createMatrixClient,
  onSessionLoggedOut,
  startSync,
  stopAndClearClient,
} from "./matrix/client";
import { ensureCryptoReady, getCryptoReadiness } from "./matrix/cryptoSetup";
import { SecretStorageKeyHolder } from "./matrix/recoveryKey";
import { clearSession, loadSession, saveSession } from "./matrix/sessionStore";
import { createAppRouter } from "./routes";
import { SessionController } from "./session/controller";
import { SessionProvider } from "./session/SessionProvider";
import { SecurityProvider, realSecurityDeps } from "./session/security";
import { ErrorBoundary } from "./shell/ErrorBoundary";
import { ThemeProvider } from "./shell/ThemeProvider";

const root = createRoot(document.getElementById("root")!);

try {
  const env = loadWebEnv();
  const logger = makeLogger(env);
  setLocale("en");
  logger.debug("web client starting", { appEnv: env.appEnv });

  const controller = new SessionController({
    homeserverUrl: env.homeserverUrl,
    logger: logger.child("session"),
    keyHolder: new SecretStorageKeyHolder(),
    getCryptoReadiness,
    ensureCryptoReady,
    loadSession: () => loadSession(),
    saveSession: (s) => saveSession(s),
    clearSession: () => clearSession(),
    login,
    register,
    refreshSession,
    logoutRemote,
    applyAccessToken,
    onSessionLoggedOut,
    createMatrixClient: (o) =>
      createMatrixClient({
        ...o,
        sdkLogLevel: env.appEnv === "production" ? "warn" : "info",
      }),
    startSync,
    stopAndClearClient,
  });

  root.render(
    <StrictMode>
      <ErrorBoundary logger={logger}>
        <ThemeProvider>
          <SessionProvider controller={controller}>
            <SecurityProvider deps={realSecurityDeps}>
              <RouterProvider router={createAppRouter()} />
            </SecurityProvider>
          </SessionProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </StrictMode>,
  );
} catch (err) {
  // Configuration errors list variable names only; safe to show in development.
  root.render(
    <div className="screen screen--centered" role="alert">
      <h1 className="type-title">Configuration error</h1>
      <p className="type-body">{err instanceof Error ? err.message : String(err)}</p>
    </div>,
  );
}

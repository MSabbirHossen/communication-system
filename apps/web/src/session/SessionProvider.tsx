import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import type { SessionController, SessionState } from "./controller";
import { t, type MessageKey } from "../i18n";

const Ctx = createContext<SessionController | null>(null);

export function SessionProvider({
  controller,
  children,
}: {
  controller: SessionController;
  children: ReactNode;
}) {
  useEffect(() => {
    void controller.boot();
  }, [controller]);
  return <Ctx.Provider value={controller}>{children}</Ctx.Provider>;
}

export function useSessionController(): SessionController {
  const c = useContext(Ctx);
  if (!c) throw new Error("useSessionController must be used within SessionProvider");
  return c;
}

export function useSession(): SessionState {
  const c = useSessionController();
  return useSyncExternalStore(c.subscribe, c.getSnapshot, c.getSnapshot);
}

/** Shown when the session could not start (storage blocked, crypto module failed, …). */
export function SessionErrorScreen() {
  const controller = useSessionController();
  const { error } = useSession();
  const code = error?.code ?? "unknown";
  return (
    <div className="screen screen--centered" role="alert">
      <h1 className="type-title">{t("error.title")}</h1>
      <p className="type-body">{t(`auth.error.${code}` as MessageKey)}</p>
      <div className="actions">
        <button
          type="button"
          className="button button--primary"
          onClick={() => window.location.reload()}
        >
          {t("error.reload")}
        </button>
        <button type="button" className="button" onClick={() => void controller.signOut()}>
          {t("settings.signOut")}
        </button>
      </div>
    </div>
  );
}

export function LoadingScreen({ label }: { label?: string }) {
  return (
    <div className="screen screen--centered" role="status" aria-live="polite">
      <p className="type-body">{label ?? t("loading")}</p>
    </div>
  );
}

/**
 * Route guard for the app proper: needs a ready session. A signed-in device that still
 * needs secure setup is sent to /setup (the composer is never shown before encryption is
 * ready, APP_FLOW 5.1); no session goes to login.
 */
export function RequireSession() {
  const { status } = useSession();
  const location = useLocation();
  if (status === "booting" || status === "starting") return <LoadingScreen />;
  if (status === "error") return <SessionErrorScreen />;
  if (status === "crypto_setup") return <Navigate to="/setup" replace />;
  if (status !== "ready")
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

/** Route guard for /setup: needs a client (setup pending or already ready). */
export function RequireClient() {
  const { status } = useSession();
  if (status === "booting" || status === "starting") return <LoadingScreen />;
  if (status === "error") return <SessionErrorScreen />;
  if (status !== "ready" && status !== "crypto_setup") return <Navigate to="/login" replace />;
  return <Outlet />;
}

/** Route guard for public auth screens: a signed-in session goes straight to the app. */
export function RedirectIfSignedIn({ children }: { children: ReactNode }) {
  const { status } = useSession();
  if (status === "booting" || status === "starting") return <LoadingScreen />;
  if (status === "error") return <SessionErrorScreen />;
  if (status === "crypto_setup") return <Navigate to="/setup" replace />;
  if (status === "ready") return <Navigate to="/chats" replace />;
  return <>{children}</>;
}

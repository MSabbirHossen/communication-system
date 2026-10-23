import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import type { SessionController, SessionState } from "./controller";
import { t } from "../i18n";

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

export function LoadingScreen({ label }: { label?: string }) {
  return (
    <div className="screen screen--centered" role="status" aria-live="polite">
      <p className="type-body">{label ?? t("loading")}</p>
    </div>
  );
}

/** Route guard: renders children only with a ready session; otherwise redirects to login. */
export function RequireSession() {
  const { status } = useSession();
  const location = useLocation();
  if (status === "booting" || status === "starting") return <LoadingScreen />;
  if (status !== "ready")
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

/** Route guard for public auth screens: a ready session goes straight to the app. */
export function RedirectIfSignedIn({ children }: { children: ReactNode }) {
  const { status } = useSession();
  if (status === "booting" || status === "starting") return <LoadingScreen />;
  if (status === "ready") return <Navigate to="/chats" replace />;
  return <>{children}</>;
}

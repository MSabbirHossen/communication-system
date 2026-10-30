import { Outlet } from "react-router";
import { t } from "../i18n";
import { DESKTOP_QUERY, useMediaQuery, useOnlineStatus, useRouteFocus } from "./hooks";
import { Nav } from "./Nav";
import { SecurityBanners } from "./SecurityBanners";
import { UnverifiedDeviceBanner } from "./UnverifiedDeviceBanner";
import { usePresencePublisher } from "../session/useSettings";
import { useNotifications } from "../session/useNotifications";

export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div className="banner banner--warning" role="status" aria-live="polite">
      <span aria-hidden="true">⚠️</span> {t("offline.banner")}
    </div>
  );
}

/**
 * Responsive shell: ≥1024px shows a navigation rail beside the content (screens may
 * render two panes inside); below that, content fills the width and navigation sits
 * at the bottom (brief §8, APP_FLOW §3).
 */
export function AppShell() {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  usePresencePublisher();
  useNotifications();
  useRouteFocus();
  return (
    <div
      className={`shell ${desktop ? "shell--desktop" : "shell--mobile"}`}
      data-layout={desktop ? "desktop" : "mobile"}
    >
      <a className="skip-link" href="#main">
        {t("nav.skip")}
      </a>
      {desktop && <Nav variant="rail" />}
      <div className="shell__content">
        <OfflineBanner />
        <UnverifiedDeviceBanner />
        <SecurityBanners />
        <main id="main" className="shell__main" tabIndex={-1}>
          <Outlet context={{ desktop }} />
        </main>
      </div>
      {!desktop && <Nav variant="bottom" />}
    </div>
  );
}

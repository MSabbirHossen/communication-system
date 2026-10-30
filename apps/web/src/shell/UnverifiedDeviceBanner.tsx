import { Link } from "react-router";
import { t } from "../i18n";
import { useSession, useSessionController } from "../session/SessionProvider";

/**
 * Persistent notice on a device that skipped secure setup ("verify from another device").
 * The app stays usable; the notice offers the two ways to full trust and goes away once the
 * device is verified (ADR-0003 D5, amended 2026-10-31). Not dismissible: it is security state.
 */
export function UnverifiedDeviceBanner() {
  const { deviceUnverified } = useSession();
  const controller = useSessionController();
  if (!deviceUnverified) return null;
  return (
    <div className="banner banner--warning notice" role="status" aria-live="polite">
      <span className="notice__text">
        <span aria-hidden="true">⚠️</span> {t("notice.deviceUnverified")}
      </span>
      <button
        type="button"
        className="button button--inline"
        onClick={() => controller.reopenSetup()}
      >
        {t("notice.deviceUnverified.recoveryKey")}
      </button>
      <Link to="/settings/devices" className="button button--inline">
        {t("notice.deviceUnverified.verify")}
      </Link>
    </div>
  );
}

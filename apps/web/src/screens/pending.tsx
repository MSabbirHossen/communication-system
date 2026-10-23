import { Link } from "react-router";
import { t } from "../i18n";

/** Placeholder for routes whose screen lands in a following Phase 3 commit. */
export function PendingScreen() {
  return (
    <div className="empty" role="status">
      <p className="type-body text-muted">{t("chats.pending")}</p>
      <Link to="/chats" className="link">
        {t("nav.chats")}
      </Link>
    </div>
  );
}

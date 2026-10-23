import { Link } from "react-router";
import { t } from "../i18n";
import { useSecurity, useSecurityNotices, type Notice } from "../session/security";

function NoticeRow({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
  let text: string;
  let link: { to: string; label: string } | null = null;
  let detail: string | null = null;
  switch (notice.kind) {
    case "new_device":
      text = t("notice.newDevice");
      detail = notice.deviceIds.join(", ");
      link = { to: "/settings/devices", label: t("notice.newDevice.action") };
      break;
    case "identity_changed":
      text = t("notice.identityChanged");
      link = { to: "/settings/devices", label: t("notice.newDevice.action") };
      break;
    case "backup_disabled":
      text = t("notice.backupDisabled");
      break;
    case "verification_request":
      text = t("notice.verificationRequest");
      detail = notice.deviceId;
      link = {
        to: `/settings/devices/verify/${encodeURIComponent(notice.deviceId)}`,
        label: t("notice.verificationRequest.action"),
      };
      break;
    case "user_verification_request":
      text = t("notice.userVerificationRequest");
      detail = notice.userId;
      link = {
        to: `/chats/${encodeURIComponent(notice.roomId)}/verify`,
        label: t("notice.verificationRequest.action"),
      };
      break;
  }
  const isRequest =
    notice.kind === "verification_request" || notice.kind === "user_verification_request";
  const dismissLabel = isRequest ? t("notice.decline") : t("notice.dismiss");
  const dismiss = () => {
    if (isRequest) void notice.flow.cancel().catch(() => undefined);
    onDismiss();
  };
  return (
    <li className="banner banner--warning notice">
      <span className="notice__text">
        <span aria-hidden="true">⚠️</span> {text} {detail && <code>{detail}</code>}
      </span>
      {link && (
        <Link to={link.to} className="button button--inline">
          {link.label}
        </Link>
      )}
      <button type="button" className="button button--inline" onClick={dismiss}>
        {dismissLabel}
      </button>
    </li>
  );
}

/** Security notices for the signed-in account (new device, identity change, verification requests). */
export function SecurityBanners() {
  const store = useSecurity();
  const notices = useSecurityNotices();
  if (notices.length === 0) return null;
  return (
    <ul className="notice-list" aria-label={t("notice.list")} aria-live="polite">
      {notices.map((n) => (
        <NoticeRow key={n.id} notice={n} onDismiss={() => store.dismiss(n.id)} />
      ))}
    </ul>
  );
}

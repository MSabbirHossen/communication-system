import { useState } from "react";
import { t } from "../i18n";
import { useSessionController } from "../session/SessionProvider";

/** Shown while another tab or window holds this device's lease (ADR-0005). */
export function OtherTabScreen() {
  const controller = useSessionController();
  const [busy, setBusy] = useState(false);
  return (
    <section className="screen screen--centered" role="alert" aria-labelledby="other-tab-title">
      <h1 id="other-tab-title" className="type-title">
        {t("tabs.title")}
      </h1>
      <p className="type-body">{t("tabs.body")}</p>
      <div className="actions">
        <button
          type="button"
          className="button button--primary"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void controller.takeOverTab().finally(() => setBusy(false));
          }}
        >
          {busy ? t("auth.working") : t("tabs.useThis")}
        </button>
      </div>
      <p className="type-meta text-muted">{t("tabs.note")}</p>
    </section>
  );
}

import { t } from "../i18n";

/** Loading placeholder: visible bars for sighted users, one "Loading…" status for assistive tech. */
export function Skeleton({ lines = 4, label }: { lines?: number; label?: string }) {
  return (
    <div className="skeleton" role="status" aria-live="polite" aria-label={label ?? t("loading")}>
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className="skeleton__bar" aria-hidden="true" />
      ))}
    </div>
  );
}

import { Component, type ErrorInfo, type ReactNode } from "react";
import { t } from "../i18n";
import type { WebLogger } from "../lib/logger";

interface Props {
  logger: WebLogger;
  children: ReactNode;
}
interface State {
  failed: boolean;
}

/** Last-resort error screen (TRD §4.1 error state). Never shows stack traces to users. */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.logger.error("render failed", { error, componentStack: info.componentStack });
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="screen screen--centered" role="alert">
        <h1 className="type-title">{t("error.title")}</h1>
        <p className="type-body">{t("error.body")}</p>
        <button
          type="button"
          className="button button--primary"
          onClick={() => window.location.reload()}
        >
          {t("error.reload")}
        </button>
      </div>
    );
  }
}

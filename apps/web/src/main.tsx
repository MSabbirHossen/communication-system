import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import "./styles/global.css";
import { loadWebEnv } from "./config/env";
import { setLocale } from "./i18n";
import { makeLogger } from "./lib/logger";
import { createAppRouter } from "./routes";
import { ErrorBoundary } from "./shell/ErrorBoundary";
import { ThemeProvider } from "./shell/ThemeProvider";

const root = createRoot(document.getElementById("root")!);

try {
  const env = loadWebEnv();
  const logger = makeLogger(env);
  setLocale("en");
  logger.debug("web client starting", { appEnv: env.appEnv });
  root.render(
    <StrictMode>
      <ErrorBoundary logger={logger}>
        <ThemeProvider>
          <RouterProvider router={createAppRouter()} />
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

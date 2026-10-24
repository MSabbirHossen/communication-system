// Native shell integration (ADR-0006): detect Capacitor, resume sync when the app returns
// to the foreground, and map the Android back button to browser history. Everything is
// injectable so the behaviour is unit-tested without a device.
import { App, type AppPlugin } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

export function nativePlatform(): "android" | "ios" | "web" {
  const p = Capacitor.getPlatform();
  return p === "android" || p === "ios" ? p : "web";
}

export interface LifecycleHooks {
  /** The app came to the foreground: nudge the sync loop (long polls may have been frozen). */
  onResume(): void;
}

export interface LifecycleHost {
  app: Pick<AppPlugin, "addListener" | "minimizeApp">;
  goBack(): void;
}

const defaultHost: LifecycleHost = {
  app: App,
  goBack: () => window.history.back(),
};

/**
 * Install the lifecycle listeners; returns a function that removes them. Back button: go
 * back while the WebView has history, otherwise minimise (never exit, which would drop the
 * in-memory send queue and surprise the user).
 */
export async function installNativeLifecycle(
  hooks: LifecycleHooks,
  host: LifecycleHost = defaultHost,
): Promise<() => Promise<void>> {
  const handles = await Promise.all([
    host.app.addListener("appStateChange", ({ isActive }) => {
      if (isActive) hooks.onResume();
    }),
    host.app.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack) host.goBack();
      else void host.app.minimizeApp();
    }),
  ]);
  return async () => {
    await Promise.all(handles.map((h) => h.remove()));
  };
}

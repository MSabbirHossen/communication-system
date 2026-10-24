import { useEffect, useRef, useSyncExternalStore } from "react";
import { useLocation } from "react-router";

/** True when the media query matches; subscribes to changes. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () =>
      typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : false,
    () => false,
  );
}

/** Desktop breakpoint from the design tokens (brief §8: ≥1024px). */
export const DESKTOP_QUERY = "(min-width: 1024px)";

/** Mirrors navigator.onLine and the online/offline events. */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener("online", onChange);
      window.addEventListener("offline", onChange);
      return () => {
        window.removeEventListener("online", onChange);
        window.removeEventListener("offline", onChange);
      };
    },
    () => (typeof navigator === "undefined" ? true : navigator.onLine),
    () => true,
  );
}

/**
 * After navigating, move focus to the new screen's first heading (or the main region) so
 * keyboard and screen-reader users land on the content, not at the top of the page.
 */
export function useRouteFocus(): void {
  const { pathname } = useLocation();
  const previous = useRef(pathname);
  useEffect(() => {
    if (previous.current === pathname) return;
    previous.current = pathname;
    const main = document.getElementById("main");
    if (!main) return;
    const target = main.querySelector<HTMLElement>("h1") ?? main;
    if (!target.hasAttribute("tabindex")) target.tabIndex = -1;
    target.focus({ preventScroll: false });
  }, [pathname]);
}

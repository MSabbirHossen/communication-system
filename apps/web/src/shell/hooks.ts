import { useSyncExternalStore } from "react";

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

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ThemePreference = "system" | "light" | "dark";
const STORAGE_KEY = "cs.theme";
const PREFERENCES: ThemePreference[] = ["system", "light", "dark"];

interface ThemeContextValue {
  preference: ThemePreference;
  setPreference(p: ThemePreference): void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStored(): ThemePreference {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return PREFERENCES.includes(v as ThemePreference) ? (v as ThemePreference) : "system";
  } catch {
    return "system";
  }
}

/** Applies `data-theme` to <html>; "system" removes it so the CSS media query decides. */
export function applyTheme(preference: ThemePreference): void {
  const root = document.documentElement;
  if (preference === "system") delete root.dataset.theme;
  else root.dataset.theme = preference;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStored);

  useEffect(() => {
    applyTheme(preference);
  }, [preference]);

  const setPreference = useCallback((p: ThemePreference) => {
    setPreferenceState(p);
    try {
      window.localStorage.setItem(STORAGE_KEY, p);
    } catch {
      // Storage may be unavailable (private mode); the in-memory preference still applies.
    }
  }, []);

  const value = useMemo(() => ({ preference, setPreference }), [preference, setPreference]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

// Minimal localization plumbing (TRD §12.3): the shell sets `lang`/`dir` from the
// first iteration so RTL and text expansion are architectural, not retrofits.
// Only English strings exist in Phase 1; Bengali and Arabic tables arrive in Phase 4.

export type Locale = "en" | "bn" | "ar";
export const LOCALES: Record<Locale, { dir: "ltr" | "rtl"; label: string }> = {
  en: { dir: "ltr", label: "English" },
  bn: { dir: "ltr", label: "বাংলা" },
  ar: { dir: "rtl", label: "العربية" },
};

const en = {
  "app.name": "Communication System",
  "nav.chats": "Chats",
  "nav.people": "People",
  "nav.settings": "Settings",
  "welcome.title": "Private messaging, end to end",
  "welcome.body":
    "Messages are encrypted on your device and can only be read by the people you send them to. Not even the server can read them.",
  "welcome.signIn": "Sign in",
  "welcome.create": "Create account",
  "welcome.privacy": "Read the privacy notes",
  "chats.empty.title": "No conversations yet",
  "chats.empty.body": "Start a conversation from People.",
  "chats.select": "Select a conversation",
  "people.empty.title": "Find people",
  "people.empty.body": "Search is available after sign-in.",
  "settings.title": "Settings",
  "settings.theme": "Theme",
  "settings.theme.system": "System",
  "settings.theme.light": "Light",
  "settings.theme.dark": "Dark",
  "settings.language": "Language",
  "offline.banner": "You are offline. Messages will send when you reconnect.",
  "error.title": "Something went wrong",
  "error.body": "The app hit an unexpected error. Reload to try again.",
  "error.reload": "Reload",
  "notFound.title": "Page not found",
  "notFound.back": "Back to chats",
  loading: "Loading…",
  comingSoon: "Available in a later phase.",
} as const;

export type MessageKey = keyof typeof en;
const tables: Record<Locale, Partial<Record<MessageKey, string>>> = { en, bn: {}, ar: {} };

let current: Locale = "en";

export function setLocale(locale: Locale): void {
  current = locale;
  if (typeof document !== "undefined") {
    document.documentElement.lang = locale;
    document.documentElement.dir = LOCALES[locale].dir;
  }
}

export function getLocale(): Locale {
  return current;
}

/** Translate a key; falls back to English, then to the key itself. */
export function t(key: MessageKey): string {
  return tables[current][key] ?? en[key] ?? key;
}

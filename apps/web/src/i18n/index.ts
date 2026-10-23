// Minimal localization plumbing (TRD §12.3): the shell sets `lang`/`dir` from the
// first iteration so RTL and text expansion are architectural, not retrofits.
// Only English strings exist for now; Bengali and Arabic tables arrive in Phase 4.

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
  "nav.back": "Back",
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
  "settings.signOut": "Sign out of this device",
  "settings.signedInAs": "Signed in as",
  "offline.banner": "You are offline. Messages will send when you reconnect.",
  "error.title": "Something went wrong",
  "error.body": "The app hit an unexpected error. Reload to try again.",
  "error.reload": "Reload",
  "notFound.title": "Page not found",
  "notFound.back": "Back to chats",
  loading: "Loading…",
  comingSoon: "Available in a later phase.",

  "field.showPassword": "Show password",
  "field.hidePassword": "Hide password",

  // Authentication
  "auth.login.title": "Sign in",
  "auth.register.title": "Create your account",
  "auth.subtitle":
    "Your account lives on this service's homeserver. Your messages are encrypted on your device.",
  "auth.username": "Username",
  "auth.username.hint":
    "Lowercase letters, digits and . _ = - / + only. This becomes your public address.",
  "auth.password": "Password",
  "auth.password.hint": "At least 8 characters. Your password is never stored on this device.",
  "auth.login.submit": "Sign in",
  "auth.register.submit": "Create account",
  "auth.working": "Working…",
  "auth.login.noAccount": "New here?",
  "auth.register.link": "Create an account",
  "auth.register.haveAccount": "Already have an account?",
  "auth.login.link": "Sign in",
  "auth.recovery.summary": "Forgot your password or lost a device?",
  "auth.recovery.body":
    "Account password recovery is not available in this beta. Access to your encrypted message history is separate from your password: it is restored with your recovery key, which you receive when you set up a device. Keep it somewhere safe.",
  "auth.field.required": "This field is required.",
  "auth.field.invalid_username": "Use lowercase letters, digits and . _ = - / + only.",
  "auth.field.password_too_short": "Use at least 8 characters.",
  "auth.error.invalid_credentials": "Sign-in failed. Check your username and password.",
  "auth.error.user_in_use": "That username is taken. Choose another.",
  "auth.error.invalid_username": "That username is not allowed by the server.",
  "auth.error.weak_password":
    "The server rejected that password as too weak. Choose a longer or more varied one.",
  "auth.error.rate_limited": "Too many attempts. Wait a moment and try again.",
  "auth.error.rate_limited_after": "Too many attempts. Try again in {seconds} seconds.",
  "auth.error.unsupported_flow":
    "This server requires a registration step this app does not support yet.",
  "auth.error.session_expired": "Your session has expired. Sign in again.",
  "auth.error.storage_unavailable":
    "This browser does not allow the app to store its data (private mode or blocked storage). Use a normal window.",
  "auth.error.network": "Cannot reach the server. Check your connection and try again.",
  "auth.error.server": "The server had a problem. Try again in a moment.",
  "auth.error.unknown": "Something went wrong. Try again.",

  // Privacy notes (placeholder for the Phase 8 disclosure)
  "privacy.title": "Privacy notes",
  "privacy.e2ee":
    "Direct messages are end-to-end encrypted with the Matrix protocol. The server stores only encrypted events and cannot read them.",
  "privacy.metadata":
    "The server can still see who talks to whom, when, message sizes, your devices' public keys, and connection details such as IP addresses. Metadata is not encrypted.",
  "privacy.webKeys":
    "In a web browser your encryption keys are stored in the browser's storage for this site. They are protected by browser isolation, not by dedicated hardware.",
  "privacy.recovery":
    "Your recovery key is the only way to restore encrypted history on a new device. We cannot recover it for you.",
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

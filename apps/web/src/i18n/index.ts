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

  // Secure device setup (UI brief §6.3)
  "setup.title": "Secure this device",
  "setup.intro":
    "Signing in is done. Now this device gets its own encryption identity so your messages can only be read on devices you control.",
  "setup.progress": "Setup progress",
  "setup.step.checking": "Checking this device",
  "setup.step.cross_signing": "Creating your account's identity",
  "setup.step.secret_storage": "Protecting your keys with a recovery key",
  "setup.step.key_backup": "Enabling encrypted message backup",
  "setup.password.why":
    "The server asks you to confirm your password before this device can publish your identity keys.",
  "setup.password.submit": "Confirm",
  "setup.cancel": "Cancel",
  "setup.restore.why":
    "This account was already set up on another device. Enter your recovery key to restore your identity and encrypted history here, or verify this device from one of your other devices instead.",
  "setup.restore.keyLabel": "Recovery key",
  "setup.restore.hint": "The key you saved when you set up your first device. Spaces are ignored.",
  "setup.restore.invalid":
    "That recovery key is not valid for this account. Check it and try again.",
  "setup.restore.submit": "Restore",
  "setup.restore.skip": "I don't have it — verify from another device",
  "setup.key.why":
    "This recovery key is the only way to restore your encrypted history on a new device. Save it somewhere safe, outside this browser.",
  "setup.key.warning":
    "If you lose this key and all your devices, your message history cannot be recovered by anyone, including us.",
  "setup.key.label": "Your recovery key",
  "setup.key.copy": "Copy",
  "setup.key.copied": "Copied",
  "setup.key.download": "Download as text file",
  "setup.key.confirm": "I have saved my recovery key",
  "setup.continue": "Continue",
  "setup.retry": "Try again",
  "setup.failed.cancelled":
    "Setup was cancelled. This device cannot send encrypted messages until setup completes.",
  "setup.done.ready":
    "This device is set up. Your recovery key is saved and encrypted backup is on.",
  "setup.done.restored": "Your identity and encrypted history were restored on this device.",
  "setup.done.unverified":
    "This device is signed in but not yet verified. Verify it from one of your other devices (Settings → Devices) to use it for encrypted messages with full trust.",

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

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
  "nav.skip": "Skip to content",
  "welcome.title": "Private messaging, end to end",
  "welcome.body":
    "Messages are encrypted on your device and can only be read by the people you send them to. Not even the server can read them.",
  "welcome.signIn": "Sign in",
  "welcome.create": "Create account",
  "welcome.privacy": "Read the privacy notes",
  "welcome.terms": "Terms of service",
  "welcome.points.encrypted": "End-to-end encrypted one-to-one messages",
  "welcome.points.devices": "Your devices, verified by you",
  "welcome.points.private":
    "Private by default: no read receipts or discoverability unless you choose",
  "terms.title": "Terms of service",
  "terms.body":
    "The terms of service are being prepared for the closed beta and will appear here before the first release. Until then this software is for development and testing only.",
  "chats.empty.title": "No conversations yet",
  "chats.empty.body": "Start one with someone's username or Matrix ID.",
  "chats.select": "Select a conversation",
  "chats.list": "Conversations",
  "chats.new": "New conversation",
  "chats.search": "Search conversations",
  "chats.search.noResults": "No conversations match.",
  "chats.preview.you": "You: ",
  "chats.preview.encrypted": "Encrypted message",
  "chats.preview.none": "No messages yet",
  "chats.unread": "{count} unread",
  "chats.invite.label": "Invitation",
  "chats.invite.body": "This person wants to start an encrypted conversation with you.",
  "chats.invite.accept": "Accept",
  "chats.invite.decline": "Decline",
  "chats.sync.error": "Cannot reach the server to sync. Retrying…",
  "chats.sync.retry": "Retry now",
  "chats.pending": "This part of messaging arrives in the next commit.",

  // Conversation (UI brief 6.6)
  "chat.messages": "Messages",
  "chat.empty": "No messages yet. Everything you send here is end-to-end encrypted.",
  "chat.encrypted": "Encrypted",
  "chat.notEncrypted": "Not encrypted",
  "chat.details": "Details",
  "chat.notFound.title": "Conversation not found",
  "chat.composer.label": "Message",
  "chat.composer.placeholder": "Write a message (Enter to send, Shift+Enter for a new line)",
  "chat.composer.disabled": "Messages cannot be sent here",
  "chat.send": "Send",
  "chat.loadOlder": "Load older messages",
  "chat.identityChanged":
    "This person's security identity has changed since you verified them. Check their devices before trusting new messages.",

  // Recipient security and conversation details (UI brief 6.7)
  "security.identity.verified": "Identity verified",
  "security.identity.changed": "Identity changed",
  "security.identity.unverified": "Identity not verified",
  "security.unverifiedDevices": "Unverified devices",
  "security.identity.verified.help":
    "You verified this person. Messages are encrypted to devices their verified identity vouches for.",
  "security.identity.changed.help":
    "Their identity keys were replaced after you verified them. This happens after a reset or a compromise. Compare fingerprints or verify them again before trusting new messages.",
  "security.identity.unverified.help":
    "Encryption protects these messages in transit and on the server, but you have not confirmed who holds the other side. Verify them by comparing emoji to be sure.",
  "security.identity.unknown.help": "Verification state is unavailable on this device.",
  "details.title": "Conversation details",
  "details.identity": "Identity",
  "details.encryption": "Encryption",
  "details.encryption.help":
    "Messages are end-to-end encrypted (Megolm) on your devices. The server stores only ciphertext. Being encrypted does not by itself prove who is on the other side.",
  "details.devices": "Their devices",
  "details.devices.none": "No encryption keys are published for this person yet.",
  "details.devices.help":
    "Every device of theirs that can read this conversation. Not verified means their identity has not vouched for it; compare fingerprints out of band if in doubt.",
  "details.verify": "Verify this person",
  "details.leave": "Leave conversation",
  "details.leave.title": "Leave this conversation?",
  "details.leave.body":
    "You will stop receiving messages here and the conversation leaves your list. Messages already on your devices are not erased.",
  "chat.status.pending": "Sending\u2026",
  "chat.status.sent": "Sent",
  "chat.status.failed": "Not sent",
  "chat.retry": "Retry",
  "chat.discard": "Delete",
  "chat.encryptionRequired":
    "This conversation is not encrypted, so nothing can be sent in it. Messages are never sent unencrypted.",
  "chat.undecryptable": "Unable to decrypt this message on this device.",
  "chat.unsupported": "This message type is not supported yet:",
  "chat.system.encryption_enabled": "End-to-end encryption is on for this conversation.",
  "chat.system.joined": "Joined the conversation.",
  "chat.system.left": "Left the conversation.",
  "chat.system.invited": "Invitation sent.",
  "chat.system.verification_request": "Identity verification requested.",
  "chat.decryptionReason.MEGOLM_UNKNOWN_INBOUND_SESSION_ID": "waiting for the key",
  "chat.decryptionReason.MEGOLM_KEY_WITHHELD": "key withheld by the sender",
  "chat.decryptionReason.MEGOLM_KEY_WITHHELD_FOR_UNVERIFIED_DEVICE":
    "key withheld because this device is unverified",
  "chat.decryptionReason.OLM_UNKNOWN_MESSAGE_INDEX": "sent before this device had the key",
  "chat.decryptionReason.HISTORICAL_MESSAGE_NO_KEY_BACKUP": "sent before this device was set up",
  "chat.decryptionReason.HISTORICAL_MESSAGE_BACKUP_UNCONFIGURED":
    "sent before this device was set up",
  "chat.decryptionReason.HISTORICAL_MESSAGE_WORKING_BACKUP": "restoring from backup",
  "chat.decryptionReason.HISTORICAL_MESSAGE_USER_NOT_JOINED": "sent before you joined",
  "chat.decryptionReason.SENDER_IDENTITY_PREVIOUSLY_VERIFIED": "sender identity changed",
  "chat.decryptionReason.UNSIGNED_SENDER_DEVICE": "sender device not verified by its owner",
  "chat.decryptionReason.UNKNOWN_SENDER_DEVICE": "unknown sender device",
  "chat.decryptionReason.UNKNOWN_ERROR": "unknown error",
  "chat.decryptionReason.unknown": "unknown error",
  "people.title": "New conversation",
  "people.intro":
    "Enter the username or Matrix ID of the person you want to message. Search by name arrives with discoverability settings in a later phase.",
  "people.field.label": "Username or Matrix ID",
  "people.field.hint": "For example bob or @bob:{server}",
  "people.field.empty": "Enter a username or Matrix ID.",
  "people.field.invalid": "That is not a valid username or Matrix ID.",
  "people.field.self": "That is your own account.",
  "people.lookup": "Look up",
  "people.notFound": "No account was found for",
  "people.identityNote":
    "A display name is not proof of who this is. Check the identifier, and verify their devices once you are in the conversation.",
  "people.existing": "You already have a conversation with this person.",
  "people.start": "Start encrypted conversation",
  "people.open": "Open conversation",
  "settings.title": "Settings",
  "settings.theme": "Theme",
  "settings.theme.system": "System",
  "settings.theme.light": "Light",
  "settings.theme.dark": "Dark",
  "settings.language": "Language",
  "settings.signOut": "Sign out of this device",
  "settings.sections": "Settings sections",
  "settings.profile": "Profile",
  "settings.profile.body": "Your display name and identifier.",
  "settings.privacy": "Privacy & notifications",
  "settings.privacy.body": "Read receipts, presence, notification previews.",
  "settings.blocked": "Blocked users",
  "settings.blocked.body": "People whose messages and invitations you do not receive.",
  "settings.devices.body": "Active sessions, verification, sign out other devices.",
  "settings.privacyNotes.body": "What is encrypted, what the server can see.",
  "settings.language.note":
    "English is the only interface language in this beta; Bengali and Arabic layouts are prepared for translation.",
  "profile.title": "Profile",
  "profile.identifier": "Identifier",
  "profile.identifier.note":
    "Your username is part of this identifier and cannot be changed. Share it with people who want to message you.",
  "profile.displayName": "Display name",
  "profile.displayName.hint": "Shown to people you talk to. Up to 100 characters.",
  "profile.field.required": "Enter a display name.",
  "profile.field.too_long": "Use at most {max} characters.",
  "profile.save": "Save",
  "profile.saved": "Display name saved.",
  "privacySettings.intro":
    "These settings change what this app sends and shows. They are stored with your account so your other devices follow them.",
  "privacySettings.sharing": "What others can see",
  "privacySettings.receipts": "Share read receipts",
  "privacySettings.receipts.help":
    'Off: nobody sees when you read a message; your own devices still agree on what is unread. On: the people you talk to see "Read" under their messages.',
  "privacySettings.presence": "Share whether I am online",
  "privacySettings.presence.help":
    "On: the server tells people you talk to whether you are online or when you were last active. Off: this device reports itself as offline.",
  "privacySettings.notifications": "Browser notifications",
  "privacySettings.preview": "Notification text",
  "privacySettings.preview.off": "No notifications",
  "privacySettings.preview.generic": '"New message" only',
  "privacySettings.preview.sender": '"New message from <name>"',
  "privacySettings.preview.help":
    "Message content never appears in a notification. The browser also has its own permission for notifications.",
  "privacySettings.serverNote":
    "The server always sees who you talk to and when, your devices' public keys, and these settings themselves. It never sees message content.",
  "chat.readBy": "Read by {name}",
  "notifications.generic": "New message",
  "notifications.sender": "New message from {name}",
  "notifications.permission": "Browser permission:",
  "notifications.permission.default": "not asked yet",
  "notifications.permission.granted": "allowed",
  "notifications.permission.denied": "blocked in your browser settings",
  "notifications.permission.unsupported": "not supported by this browser",
  "notifications.permission.help":
    "The browser decides whether notifications may appear at all; the choice above decides what they say. They are shown only while this tab is not in front.",
  "notifications.allow": "Allow browser notifications",
  "notifications.push.pending":
    "Push notifications for this app arrive once the push gateway is set up. They will say only that a new message is available, never what it says.",
  "presence.online": "Online",
  "presence.unavailable": "Away",
  "presence.offline": "Offline",
  "presence.lastActive": "Last active {ago} ago",
  "presence.justNow": "just now",
  "blocked.title": "Blocked users",
  "blocked.intro":
    "Messages and invitations from blocked people are not delivered to any of your devices. They are not told. Blocking hides; it does not delete anything you already received, and messages sent while blocked may appear if you unblock.",
  "blocked.list": "Blocked users",
  "blocked.empty.title": "Nobody is blocked",
  "blocked.empty.body": "You can block someone from their conversation details.",
  "blocked.unblock": "Unblock",
  "blocked.unblock.title": "Unblock this person?",
  "blocked.unblock.body":
    "Messages and invitations from them will be delivered again, and messages they sent while blocked may appear.",
  "details.blocking": "Blocking",
  "details.blocking.help":
    "Blocking stops their messages and invitations from reaching any of your devices. They are not told, and nothing already received is deleted.",
  "details.blocked.state":
    "You blocked this person. Their messages and invitations are not delivered to you.",
  "details.block": "Block this person",
  "details.block.title": "Block this person?",
  "details.block.body":
    "Their messages and invitations will no longer be delivered to you, on any device. This conversation stays in your list but goes quiet. They are not told. You can unblock them from Settings.",
  "chat.blocked": "You blocked this person. Their messages are not delivered to you.",
  "settings.signedInAs": "Signed in as",
  "offline.banner": "You are offline. Messages will send when you reconnect.",
  "error.title": "Something went wrong",
  "error.body": "The app hit an unexpected error. Reload to try again.",
  "error.reload": "Reload",
  "tabs.title": "Already open in another tab",
  "tabs.body":
    "This account is open in another browser tab or window. To keep your encryption keys consistent, only one tab can run at a time.",
  "tabs.useThis": "Use this tab",
  "tabs.note": "The other tab will show this message instead.",
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

  // Dialogs
  "dialog.confirm": "Confirm",
  "dialog.cancel": "Cancel",

  // Devices and security (UI brief §6.8)
  "settings.devices": "Devices & security",
  "devices.title": "Devices & security",
  "devices.intro":
    "Every sign-in is a device with its own encryption keys. Verify your other devices so they trust each other, and sign out any you no longer use.",
  "devices.identity.title": "This device",
  "devices.identity.user": "Account",
  "devices.identity.device": "Device ID",
  "devices.identity.fingerprint": "Key fingerprint",
  "devices.identity.help":
    "Compare the fingerprint with what another device shows to confirm they belong to the same account.",
  "devices.list": "Your devices",
  "devices.empty": "No devices found.",
  "devices.current": "This device",
  "devices.unnamed": "Unnamed device",
  "devices.lastSeen": "Last active",
  "devices.lastSeen.unknown": "unknown",
  "devices.badge.verified": "Verified",
  "devices.badge.unverified": "Not verified",
  "devices.badge.unknown": "Unknown",
  "devices.badge.noKeys": "No encryption keys",
  "devices.verify": "Verify",
  "devices.rename": "Rename",
  "devices.rename.label": "Device name",
  "devices.rename.save": "Save",
  "devices.revoke": "Sign out device",
  "devices.revoke.title": "Sign out this device?",
  "devices.revoke.body":
    "The device will lose access immediately and must sign in again. Messages it already downloaded stay on that device; signing it out does not erase them.",
  "devices.revoke.confirm": "Sign out device",
  "devices.reauth.title": "Confirm it's you",
  "devices.reauth.body":
    "Enter your password to sign out a device. It is sent to the server once and not kept.",
  "devices.refresh": "Refresh list",
  "devices.signOutOthers": "Sign out all other devices",
  "devices.signOutOthers.title": "Sign out all other devices?",
  "devices.signOutOthers.body":
    "Every device except this one loses access immediately and must sign in again. Messages they already downloaded stay on those devices.",
  "devices.signOutOthers.done": "{count} other device(s) signed out.",

  // Own-device verification (APP_FLOW 5.4)
  "verify.title": "Verify device",
  "verify.deviceLabel": "Device",
  "verify.waiting.accept":
    "Waiting for your other device to accept the request. Open it and choose Review on the notice it shows.",
  "verify.incoming.body":
    "Another of your devices asked to verify with this one. Continue only if you started this from a device you control.",
  "verify.accept": "Continue",
  "verify.decline": "Decline",
  "verify.starting": "Starting the emoji comparison…",
  "verify.waiting.start": "Waiting for the other device to start the emoji comparison…",
  "verify.intro":
    "Compare these emoji with the ones shown on your other device. They must be the same, in the same order.",
  "verify.emoji.list": "Emoji to compare",
  "verify.compare": "Do both devices show the same emoji?",
  "verify.match": "They match",
  "verify.mismatch": "They don't match",
  "verify.confirming": "Waiting for the other device to confirm…",
  "verify.done.body": "Device verified. Both devices now trust each other's encryption keys.",
  "verify.cancelled.mismatch":
    "The emoji did not match, so this device was not verified. If you did not expect this, sign that device out from Devices & security.",
  "verify.cancelled.user": "Verification was cancelled. The device stays unverified.",
  "verify.cancelled.other": "Verification did not complete. The device stays unverified.",
  "verify.cancel": "Cancel",
  "verify.back": "Back to devices",
  "verify.user.title": "Verify {name}",
  "verify.userLabel": "Person",
  "verify.waiting.accept.user":
    "Waiting for them to accept the request. They will see a notice in this conversation.",
  "verify.incoming.user.body":
    "This person asked to verify with you. Continue only if you expect it, then compare the emoji with them over a channel you trust (a call, in person).",
  "verify.done.user.body":
    "Identity verified. You confirmed this person holds the keys behind their account; their devices are now shown as verified when their identity vouches for them.",
  "verify.back.details": "Back to conversation details",

  // Security notices (THREAT_MODEL TM-03, TM-08)
  "notice.list": "Security notices",
  "notice.newDevice": "A new device signed in to your account:",
  "notice.newDevice.action": "Review devices",
  "notice.identityChanged":
    "Your account's security identity changed. If you did not set up a new device or reset your keys, review your devices now.",
  "notice.backupDisabled": "Encrypted message backup is turned off for this account.",
  "notice.verificationRequest": "One of your devices wants to verify with this one:",
  "notice.userVerificationRequest": "Someone wants to verify their identity with you:",
  "notice.verificationRequest.action": "Review",
  "notice.decline": "Decline",
  "notice.dismiss": "Dismiss",

  // Privacy notes (placeholder for the Phase 8 disclosure)
  "privacy.title": "Privacy notes",
  "privacy.e2ee":
    "Direct messages are end-to-end encrypted with the Matrix protocol. The server stores only encrypted events and cannot read them.",
  "privacy.metadata":
    "The server can still see who talks to whom, when, message sizes, your devices' public keys, and connection details such as IP addresses. Metadata is not encrypted.",
  "privacy.webKeys":
    "In a web browser your encryption keys are stored in the browser's storage for this site. They are protected by browser isolation, not by dedicated hardware.",
  "privacy.mobileKeys":
    "In the Android and iOS apps your encryption keys are stored in the app's private storage on the device, protected by the operating system's app sandbox and file encryption, not by dedicated security hardware. Your sign-in tokens are kept in the platform's secure storage.",
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

/** The English catalogue, for export to translators (`pnpm i18n:extract`). */
export function catalogue(): Record<MessageKey, string> {
  return { ...en };
}

const formatters = new Map<string, Intl.DateTimeFormat>();

/** A date/time formatter for the active locale (cached per locale and options). */
export function dateTimeFormat(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${current}:${JSON.stringify(options)}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(current, options);
    formatters.set(key, f);
  }
  return f;
}

/**
 * Translate a key; falls back to English, then to the key itself. `vars` replaces
 * `{name}` placeholders.
 */
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  let s: string = tables[current][key] ?? en[key] ?? key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) s = s.split(`{${name}}`).join(String(value));
  }
  return s;
}

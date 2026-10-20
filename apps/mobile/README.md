# @cs/mobile — Capacitor shell

Android and iOS apps are a Capacitor wrapper around the web client (`apps/web`), as decided provisionally in ADR-0001 condition C2. This package holds only the configuration in Phase 1.

## What exists now

- `capacitor.config.ts`: app id, name, `webDir` pointing at the web build, https scheme on both platforms so the WebView runs the bundle in a secure context (required for WebAssembly, IndexedDB and `crypto.subtle`).
- `scripts/sync.mjs`: copies the web build into native projects when they exist; prints the Phase 5 instructions otherwise.

## What does not exist yet (Phase 5)

- `android/` and `ios/` native projects. They are generated with `pnpm --filter @cs/mobile cap add android` / `cap add ios` and need Android Studio / Xcode toolchains that the current development machine lacks.
- The **real-device spike** required by ADR-0001 C2 before any mobile work continues: on Android System WebView and iOS WKWebView, verify `initRustCrypto()`, encrypt/decrypt against the project homeserver, a persistent crypto store across app restart, and session restore (restart, background/foreground). If it fails, the fallback is native Kotlin/Swift apps on matrix-rust-sdk.
- A secure-storage plugin (Keystore/Keychain) for the recovery key and session token; `localStorage` is never used for secrets.
- Push registration (generic notifications only, PRD FR-09).

## Security posture to carry forward

Crypto keys live in the WebView's IndexedDB inside the app sandbox, without hardware-backed key protection (THREAT_MODEL TM-23). This limitation must appear in the user privacy disclosure before any mobile beta (ADR-0001 C2a).

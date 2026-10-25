# ADR-0006 — Mobile shell: Capacitor wrapper, secure storage, push plumbing and the device spike

**Status:** Proposed — for the project owner's decision at the Phase 5 exit gate  
**Date:** 2026-10-24  
**Deciders:** Project owner (Android via CI builds and the owner's phone, iOS on the simulator only, push plumbing without delivery, stop-and-report on spike failure: decided 2026-10-24); implementation by the AI contributor  
**Inputs:** `docs/PRD.md` FR-09, FR-11, §12; `docs/TRD.md` §4.2, §6.2, §9; `docs/IMPLEMENTATION_PLAN.md` Phase 5; ADR-0001 C2/C2a, ADR-0003, ADR-0005; `docs/architecture/MOBILE_SPIKE.md`; `docs/security/THREAT_MODEL.md`.

Status labels follow AGENTS.md §12: **Implemented**, **Tested**, **Verified**, **Blocked**, **Deferred**.

---

## 1. Context

ADR-0001 C2 made the mobile apps a Capacitor wrapper around the web client, provisionally: the decision becomes final only when a spike on real devices shows the Rust crypto WebAssembly, persistent key storage and session restore working in the platform WebView. The development machine has no Android SDK, no Xcode and no elevated shell, so the native builds and the automated spike run in GitHub Actions; the owner sideloads the Android APK on a phone; iOS has no device or Mac available. Push delivery needs FCM and APNs credentials that do not exist yet.

## 2. Decisions

| # | Decision | Status |
|---|---|---|
| D1 | **Capacitor 8 shell with committed native projects.** `apps/mobile/android` and `apps/mobile/ios` are generated once by the Capacitor CLI and committed; the copied web bundle and generated plugin lists stay ignored. Plugins: `@capacitor/app` (lifecycle, back button) and `@aparajita/capacitor-secure-storage` (tokens). Nothing else. **WebView floor:** the bundle targets ES2022 syntax and carries one runtime shim, `Promise.withResolvers` (matrix-js-sdk 44 calls it unguarded; Chrome 119 / Safari 17.4), installed first in the entry point (`apps/web/src/platform/polyfills.ts`) so System WebViews as old as the API 34 emulator image's Chrome 113 run the client; every other newer API in the bundle is feature-checked by its caller. The CI simulator build is signed ad hoc: the simulator takes an app's entitlements from a section written at signing time, and an unsigned binary gets Keychain error -34018. | Implemented; builds Verified in CI (STATUS) |
| D2 | **Two variants.** Release serves the bundle from `https://localhost` (secure context) and allows no cleartext; the homeserver baked into the build must be https. Debug serves it from `http://localhost` on Android (still a secure context, so WebAssembly, IndexedDB and `crypto.subtle` work) and allows cleartext only through the debug build type's manifest overlay, so a debug or spike build can reach a plain-http development homeserver (emulator `10.0.2.2:8008`, a PC on the LAN). iOS cannot use http/https as its scheme (WKWebView owns them): it keeps `capacitor://localhost` and allows local-network cleartext only (`NSAllowsLocalNetworking`). `allowMixedContent` stays off everywhere (TM-27). | Verified (release and debug assemble in CI; manifests inspected) |
| D3 | **The session lives in platform secure storage; the recovery key is never stored.** The Matrix session record (tokens, identifiers) is written through the secure-storage plugin: Keystore-encrypted app-private preferences on Android, the Keychain on iOS, cloud sync off, this-device-only access class so it never migrates through backups (TM-28). The controller is unchanged: the store is injected. IMPLEMENTATION_PLAN mentioned the recovery key in native storage; ADR-0003 decided the user alone holds it, and storing it would undermine that claim, so it stays unstored. The SDK's sync and crypto stores remain in the WebView's IndexedDB inside the app sandbox without hardware-backed key protection (TM-23), stated in the privacy notes (ADR-0001 C2a). | Verified (unit with a fake plugin; spike `secure_storage` and `secure_storage_cleared`) |
| D4 | **Lifecycle.** Returning to the foreground nudges the sync loop (`retryImmediately`); the Android back button goes back while the WebView has history and otherwise minimises the app (never exits, which would drop the in-memory send queue). Safe-area insets keep content clear of the status bar. | Verified (unit with a fake App plugin); phone checklist pending (runbook §11) |
| D5 | **Push plumbing is content-free; delivery is deferred.** Pusher registration uses `event_id_only`, so the homeserver tells a gateway only which event in which room arrived. A development gateway stub on the compose network records every push and flags forbidden fields; the integration test proves the recorded payload holds identifiers and counts only (TM-12). The app registers no pusher yet: the device token provider (and the push plugin, which needs `google-services.json` to build) arrives with FCM/APNs credentials provided as secrets. Sygnal configuration for later: FCM v1 pushkin (`api_version: v1`, `project_id`, `service_account_file`) and APNs token pushkin (`keyfile`, `key_id`, `team_id`, `topic`), app ids `org.communicationsystem.app` per platform. | Verified at the gateway boundary (integration); delivery **Deferred** |
| D6 | **CSP `connect-src` is derived from configuration** (`VITE_HOMESERVER_URL`, `VITE_API_URL`) at build time, so a mobile build pointed at another homeserver gets a matching policy instead of a hand-edited one. The rest of the policy is unchanged until Phase 7 (TM-11). | Verified (unit; production bundle inspected) |
| D7 | **The spike is a flagged build of the real client code.** `VITE_MOBILE_SPIKE=1` replaces the app with a runner that executes the C2 checks through the same service modules the web client uses, prints `CS_SPIKE <check> PASS|FAIL` lines (logcat / simulator console) and shows them on screen for a phone run. Ordinary bundles contain no spike code (CI greps the output). Checks: `web_locks`, `secure_storage`, `wasm_crypto`, `crypto_setup`, `sync`, `encrypt_decrypt`, `reply_sent`, `peer_roundtrip` (the Node peer decrypts the reply), then after a force-stop and relaunch `session_restores`, `store_persists` (same device keys), `history_persists` (the peer's message decrypted again from the persisted stores), `revocation` (deleted device noticed), `secure_storage_cleared`. | Verified in Chromium against the compose Synapse (13/13); device results in §3 |
| D8 | **CI is the build and proof path.** The Mobile workflow builds debug and spike APKs to sideload (homeserver URL as a dispatch input), runs the spike on an API 34 x86_64 emulator (System WebView) with the compose Synapse and push stub and the Node peer, and builds and runs it on the iOS simulator on a `macos-26` runner (Xcode 26, Capacitor 8's minimum) with a Synapse installed from pip. Reports become annotations and evidence artifacts. The emulator job is pinned to `ubuntu-24.04` (the image where the emulator boots; `ubuntu-latest` is migrating to Ubuntu 26) and annotates the runner image, so a failure is diagnosable from the public run page. | Verified (run #7 green on all three jobs; STATUS) |
| D9 | **C2 status per platform, honestly.** Android: emulator spike plus the owner's phone checklist. iOS: simulator only; real-iPhone verification is **Blocked** until a Mac and an iPhone exist, so C2 stays provisional for iOS. If a required check fails on a platform, work stops and the native Kotlin/Swift fallback is proposed with a re-estimate (owner decision). | Recorded |

## 3. Spike results

| Platform | Where | Result | Evidence |
|---|---|---|---|
| Chromium (browser, same runner code) | local, compose Synapse 1.163.x | 13/13 PASS | STATUS verification (2026-10-24) |
| Android System WebView | CI emulator, API 34 x86_64 (System WebView Chrome 113, `ubuntu-24.04` runner) | **13/13 PASS** (Mobile run #7 (40165486938, `dd21d44`, 2026-10-25)) | `android-spike-evidence` artifact; annotations on the run page |
| Android (owner's phone) | sideloaded spike APK + checklist | pending the owner | runbook §11 record |
| iOS WKWebView (simulator) | CI `macos-26`, iOS 18.7 simulator, ad-hoc signed Debug build | **13/13 PASS** (Mobile run #7 (40165486938, `dd21d44`, 2026-10-25)) | `ios-spike-evidence` artifact; annotations on the run page |
| iOS (real device) | — | **Blocked** (no Mac/iPhone) | — |

## 4. What the server can see (ADR-0001 §6.2, ADR-0004 §3, ADR-0005 §4 unchanged)

Plus, once push delivery exists: the pusher record (app id, push token, gateway URL) and, at the gateway, event and room identifiers with unread counts. Never content, sender names or room names for this client's pushers.

## 5. Alternatives considered

- **Native Kotlin/Swift on matrix-rust-sdk now** — rejected while the wrapper's spike passes (MOBILE_SPIKE.md option C stays the fallback).
- **Android `allowMixedContent` instead of the http scheme** — rejected: mixed-content exceptions weaken the WebView for everything; the http origin on Android is a secure context and the cleartext permission is confined to the debug build type.
- **Storing the recovery key in the Keychain/Keystore** — rejected (D3).
- **Sygnal in compose with placeholder credentials** — rejected: Sygnal cannot start a pushkin without real credentials; the stub proves the server-side property, which is the security claim.
- **Appium or Playwright against the WebView for the spike** — rejected: the flagged runner exercises the same code with far less machinery and also works on the owner's phone without tooling.

## 6. Consequences

- Native projects are code to review like any other; Capacitor upgrades regenerate parts of them.
- Debug builds can talk to http homeservers; release builds cannot. A release build against the development homeserver is impossible by design.
- The secure-storage plugin is a third-party dependency (MIT, Capacitor 8); its maintenance is watched like any other.
- Push notifications will not reach a phone until credentials exist; the app says so.
- The CI mobile workflow adds roughly fifteen minutes per run across the three jobs and depends on the emulator and macOS runner availability.

## 7. Evidence

- Unit: `apps/web/src/config/csp.test.ts`, `apps/web/src/platform/{secureSession,native,polyfills}.test.ts`, `apps/web/src/matrix/pushers.test.ts`.
- Integration: `apps/web/test/integration/push.integration.test.ts`; peer `apps/web/test/spike/peer.test.ts`.
- Device: `apps/web/src/spike/runner.ts`, `apps/mobile/scripts/spike-*.sh`, `.github/workflows/mobile.yml`; artifacts `android-apks`, `android-spike-evidence`, `ios-spike-evidence`.
- Manual: `docs/runbooks/local-development.md` §11.

## 8. Open items

- Real FCM/APNs delivery and Sygnal deployment; the device token provider and push plugin.
- Real-iPhone verification; signing and store release configuration; app lock.
- Hardware-backed key protection for the SDK stores would need the native fallback (option C).

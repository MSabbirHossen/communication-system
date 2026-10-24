# Project Status

## Active phase
Phase 5 — Android and iOS (**implementation complete on local `main`; not pushed; the Mobile workflow has not run yet, so the device evidence is still pending**)

## Last completed milestone
**Phase 4 complete — exit gate accepted by the owner on 2026-10-24; ADR-0005 Accepted.** CI run 40098979625 green on `7c605a3`. Phase 3 closed 2026-10-24 (ADR-0004 Accepted); Phase 2 closed 2026-10-23 (ADR-0003 Accepted); Phase 1 closed 2026-10-23; Phase 0 approved with conditions 2026-10-20 (ADR-0001 Accepted).

## Current task
Phase 5 per the approved plan (2026-10-24), implemented as five commits on local `main` on top of `bff7576`: native projects and build variants `135aab0`, secure session storage and lifecycle `c101907`, content-free push plumbing `77be671`, spike runner and the Mobile CI workflow `97d759f`, documentation `5088e51` plus this status. **Not pushed**: the push, which triggers the first Mobile workflow run (Android APKs, emulator spike, iOS simulator), follows the owner's go-ahead, as in Phase 4.

## Completed (Phase 5)
Labels follow AGENTS.md §12. Unit = jsdom/Node; integration = Node against the compose Synapse 1.163.x; browser = the spike runner in Chromium against the compose Synapse; device = CI emulator/simulator or the owner's phone.

| Deliverable | Status | Evidence |
|---|---|---|
| Android and iOS Capacitor 8 projects committed; release variant (https origin, no cleartext, no backup) and debug variant (http origin on Android, cleartext only in the debug build type; iOS local-network cleartext only) (ADR-0006 D1, D2; TM-27, TM-28) | Implemented; `cap sync` Verified locally for both platforms; **native builds not yet run** (CI) | `apps/mobile/{android,ios}`, `capacitor.config.ts`, debug manifest overlay |
| CSP `connect-src` derived from the configured homeserver and API origins at build time (ADR-0006 D6) | Verified | unit (`csp.test.ts`); dev page inspected; production bundle inspected |
| Session record in native secure storage (Keystore/Keychain, no cloud sync, this-device-only); recovery key never stored; controller unchanged (ADR-0006 D3; TM-23) | Verified (logic) | unit with a fake plugin; spike `secure_storage` / `secure_storage_cleared` (the browser run uses the IndexedDB store; the native plugin is exercised only on a device) |
| Lifecycle: resume nudges sync; back button goes back or minimises; safe-area insets; mobile key-storage sentence in the privacy notes (ADR-0001 C2a) | Verified (logic) | unit with a fake App plugin; phone checklist pending |
| Content-free push plumbing: `event_id_only` pusher registration, gateway stub in compose, Synapse whitelist for the compose network (ADR-0006 D5; TM-12) | Verified at the gateway boundary | unit; integration (`push.integration.test.ts`: the stub received `counts, devices, event_id, prio, room_id` only, no violations; pusher removed afterwards) |
| Push delivery to devices (FCM/APNs through Sygnal, device token provider, push plugin) | **Deferred** (owner decision: no credentials) | ADR-0006 D5 records the Sygnal configuration for later |
| On-device spike runner (flagged build, absent from ordinary bundles) with 13 checks and the Node peer (ADR-0006 D7) | Verified in Chromium: **13/13 PASS** | local run 2026-10-24 (two accounts, phase 1 → peer → reload → phase 2); the CI `checks` job greps the production bundle for the marker |
| Mobile workflow: debug and spike APK artifacts, Android emulator spike (compose Synapse + push stub + peer), iOS simulator build and spike (pip Synapse), annotations and evidence artifacts (ADR-0006 D8) | Implemented; **not yet run** | `.github/workflows/mobile.yml`, `apps/mobile/scripts/spike-*.sh`, `synapse-pip.sh`, `spike-report.mjs` |
| ADR-0006, THREAT_MODEL (TM-12, TM-23, new TM-27, TM-28), runbook §11 with the device record, this status | Implemented | `docs/architecture/ADR-0006-mobile-shell.md` (Status: Proposed) |

## Verification
Executed 2026-10-24 on Windows 11, Node 22.20, pnpm 12.14, TypeScript 6.0.3, Docker Desktop (Synapse 1.163.x, MongoDB 7, push stub):

- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build` (includes `cap sync` of both native projects) — pass at the tip. Spike marker absent from the production bundle, present in the spike build (checked by grep).
- `pnpm test` (whole workspace) — 46 files pass, 10 skipped by design; **348 tests pass, 24 skipped** (integration and the spike peer skip without their environment). Web alone: 274.
- `HOMESERVER_URL=http://localhost:8008 npx vitest run --project web-integration push.integration` — **1 passed**: the gateway stub recorded two pushes for the invited and messaged account with keys `counts, devices, event_id, prio, room_id` and no forbidden field; the Synapse log shows `Received response to POST http://cs-push-stub:8010/_matrix/push/v1/notify: 200`.
- Spike runner in Chromium (spike build served by `vite preview`, compose Synapse): phase 1 `web_locks, secure_storage, wasm_crypto, crypto_setup, sync, encrypt_decrypt, reply_sent` PASS; peer `peer_roundtrip` PASS; after reload `session_restores, store_persists, history_persists, revocation, secure_storage_cleared` PASS. One defect found and fixed during this run: the history check read the cached timeline before decryption finished; it now waits and pages once, as the app does.
- Not run locally (no toolchain): Gradle and Xcode builds, the emulator and simulator spikes, the owner's phone checklist.
- CI (pushed 2026-10-24 on the owner's go-ahead): run 40109444999 (`2743ecd`) green on all four jobs, including the push-stub integration test and the e2e suite. Mobile workflow, first runs: #1 failed at `setup-android@v3` (no longer runs; moved to v4), #2/#3 at the committed `gradlew` lacking the executable bit (exit 126; bit set, workflow chmods) and at spike scripts truncated by a patch (rewritten); run #4 (`5037863`, 40111021726): **Android debug and spike APKs built and uploaded** (2m44s); **Android emulator spike** (API 34 System WebView): `web_locks`, `secure_storage` (Keystore plugin) and `wasm_crypto` PASS, then no further line (stalled at crypto setup); **iOS simulator**: built, console captured, `web_locks` PASS, then no further line (stalled at registration or secure storage). Run #5 (`90d4ef9`) adds step markers and public log annotations to find the cause. **In progress when the session's usage limit was reached.**

## Phase 5 exit gate (IMPLEMENTATION_PLAN.md)
| Criterion | Evidence so far | Outstanding |
|---|---|---|
| Android and iOS builds install and launch | native projects generated and synced | Mobile workflow run (APK, emulator, simulator); owner's phone install |
| Encrypted direct messaging works across web and mobile | spike `encrypt_decrypt` + `peer_roundtrip` in Chromium with the web client's own code | the same on the emulator and simulator; owner's phone ↔ web |
| Device verification and session revocation work as designed | spike `revocation`; Phase 2/3 flows unchanged | owner's phone: verify from web, sign out from web |
| Push notifications do not expose message contents by default | gateway-boundary integration test; generic text in the app | delivery deferred (no credentials) — recorded |
| Offline and reconnection flows pass manual tests | Phase 3 web evidence; lifecycle hooks unit-tested | owner's phone: airplane mode, background/foreground |

Gate **open**: implementation complete; first device evidence partial (Android: build, secure storage and wasm crypto proven on the emulator; iOS: build proven), spike completion on both platforms and the owner's phone checklist outstanding. iOS is simulator-only by the owner's decision (real device Blocked), so ADR-0001 C2 can close for Android only.

## Blockers and risks
- **R1 — Mobile E2EE on real devices untested**: now narrowed to the Mobile workflow run and the owner's phone; iOS real device Blocked (no Mac/iPhone).
- **R5 — Toolchain pins** (TypeScript 6.0.3; pnpm `allowBuilds`); Capacitor 8 requires Android Studio 2025.2.1+ / Xcode 26 for anyone building locally.
- **R6 — Web key storage is origin-scoped IndexedDB** (TM-11); on mobile the SDK stores are WebView-resident (TM-23), disclosed.
- **R7 — Registration open on the dev homeserver only**; gating is Phase 7/8.
- **R8 — Pending (unsent) messages live in memory** (Phase 7).
- **R9 — Recipient's unverified devices read new messages** until the user acts (ADR-0004 D7).
- **R10 — Settings client-honoured except blocking** (ADR-0005 D2).
- **R12 — Push delivery deferred**: phones get no notifications until FCM/APNs credentials exist; the privacy screen says so.
- **R13 — Debug builds accept plain-http homeservers**; only development homeservers may be used with them (TM-27).
- The Mobile workflow's emulator job depends on KVM on `ubuntu-latest` and the iOS job on the `macos-26` image; both untested until the first run.

## Deferred
| Item | Reason | Risk while deferred |
|---|---|---|
| FCM/APNs delivery, Sygnal, push plugin, device token provider | Credentials (owner) | Medium before beta (no mobile notifications) |
| Real-iPhone verification; signing and store configuration | No Mac/iPhone | Medium (iOS unverified on hardware) |
| App lock / biometrics | Not in scope | Low |
| Persisted send queue; HTTP-header CSP; registration gating | Phase 7 | as before |
| Discoverability, reports, moderation, account deletion | Phase 6 | as before |

## Decisions recorded 2026-10-24
- **Android via CI builds and the owner's phone; iOS simulator in CI only; push plumbing now, delivery later; stop and report if the spike fails** (owner).
- **Capacitor 8 shell with committed native projects; release/debug variants; CSP from configuration** (ADR-0006 D1, D2, D6).
- **Session record in platform secure storage; recovery key never stored** (ADR-0006 D3, amends the IMPLEMENTATION_PLAN wording).
- **Content-free pushers proven at the gateway boundary** (ADR-0006 D5).
- **The spike is a flagged build of the real client code** (ADR-0006 D7).

## Next approved action
Read the Mobile run #5 annotations (step markers and WebView errors), fix the stall after `wasm_crypto` on Android and after `web_locks` on iOS, and rerun until the spike reports all checks; then the owner sideloads the APKs (artifact `android-apks` of a green run) and fills the device record in runbook §11. The Phase 5 gate is decided on that evidence. No Phase 6 work starts before the gate closes.

## Last updated
2026-10-24

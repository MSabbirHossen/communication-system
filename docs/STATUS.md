# Project Status

## Active phase
Phase 5 — Android and iOS (**implementation complete and pushed; CI green; the Mobile workflow is green on `dd21d44` (run #7): the Android emulator and the iOS simulator spikes report 13/13; the owner's phone record is outstanding**)

## Last completed milestone
**Phase 4 complete — exit gate accepted by the owner on 2026-10-24; ADR-0005 Accepted.** CI run 40098979625 green on `7c605a3`. Phase 3 closed 2026-10-24 (ADR-0004 Accepted); Phase 2 closed 2026-10-23 (ADR-0003 Accepted); Phase 1 closed 2026-10-23; Phase 0 approved with conditions 2026-10-20 (ADR-0001 Accepted).

## Current task
**Handoff to the next AI agent (2026-10-25):** `docs/HANDOFF.md` is the snapshot for incoming agents (state, next steps in order, how to run, pitfalls); `CLAUDE.md` points to `AGENTS.md`, which is tool-agnostic. No code is half-finished. Phase 5 was delivered per the approved plan (2026-10-24): five implementation commits (`135aab0`, `c101907`, `77be671`, `97d759f`, `5088e51`) pushed on the owner's go-ahead, then fix-forward commits for the first Mobile workflow runs (`22cf406`, `970e807`, `5037863`, `90d4ef9`, `7643c78`, `2e08330`, `dd21d44`). The device spike is green on both CI platforms; what remains is the owner's phone record (runbook §11) and the gate decision. The owner is running the phone checklist (runbook §11) and will report the device record; the next agent records it and presents the gate (HANDOFF.md §5).

## Completed (Phase 5)
Labels follow AGENTS.md §12. Unit = jsdom/Node; integration = Node against the compose Synapse 1.163.x; browser = the spike runner in Chromium against the compose Synapse; device = CI emulator/simulator or the owner's phone.

| Deliverable | Status | Evidence |
|---|---|---|
| Android and iOS Capacitor 8 projects committed; release variant (https origin, no cleartext, no backup) and debug variant (http origin on Android, cleartext only in the debug build type; iOS local-network cleartext only) (ADR-0006 D1, D2; TM-27, TM-28) | Verified: Gradle debug, spike and release assemble and the Xcode simulator build in CI (run #7) | `apps/mobile/{android,ios}`, `capacitor.config.ts`, debug manifest overlay |
| CSP `connect-src` derived from the configured homeserver and API origins at build time (ADR-0006 D6) | Verified | unit (`csp.test.ts`); dev page inspected; production bundle inspected |
| Session record in native secure storage (Keystore/Keychain, no cloud sync, this-device-only); recovery key never stored; controller unchanged (ADR-0006 D3; TM-23) | Verified | unit with a fake plugin; spike `secure_storage` / `secure_storage_cleared` PASS on the emulator (Keystore) and on the simulator (Keychain), run #7 |
| Lifecycle: resume nudges sync; back button goes back or minimises; safe-area insets; mobile key-storage sentence in the privacy notes (ADR-0001 C2a) | Verified (logic) | unit with a fake App plugin; phone checklist pending |
| Content-free push plumbing: `event_id_only` pusher registration, gateway stub in compose, Synapse whitelist for the compose network (ADR-0006 D5; TM-12) | Verified at the gateway boundary | unit; integration (`push.integration.test.ts`: the stub received `counts, devices, event_id, prio, room_id` only, no violations; pusher removed afterwards) |
| Push delivery to devices (FCM/APNs through Sygnal, device token provider, push plugin) | **Deferred** (owner decision: no credentials) | ADR-0006 D5 records the Sygnal configuration for later |
| On-device spike runner (flagged build, absent from ordinary bundles) with 13 checks and the Node peer (ADR-0006 D7) | Verified: **13/13 PASS** in Chromium, on the Android emulator and on the iOS simulator (run #7) | local run 2026-10-24 (two accounts, phase 1 → peer → reload → phase 2); the CI `checks` job greps the production bundle for the marker |
| Mobile workflow: debug and spike APK artifacts, Android emulator spike (compose Synapse + push stub + peer), iOS simulator build and spike (pip Synapse), annotations and evidence artifacts (ADR-0006 D8) | Verified: run #7 (40165486938) green on all three jobs; `android-apks`, `android-spike-evidence` and `ios-spike-evidence` uploaded | `.github/workflows/mobile.yml`, `apps/mobile/scripts/spike-*.sh`, `synapse-pip.sh`, `spike-report.mjs` |
| ADR-0006, THREAT_MODEL (TM-12, TM-23, new TM-27, TM-28), runbook §11 with the device record, this status | Implemented | `docs/architecture/ADR-0006-mobile-shell.md` (Status: Proposed) |

## Verification
Executed 2026-10-24 on Windows 11, Node 22.20, pnpm 12.14, TypeScript 6.0.3, Docker Desktop (Synapse 1.163.x, MongoDB 7, push stub):

- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build` (includes `cap sync` of both native projects) — pass at the tip. Spike marker absent from the production bundle, present in the spike build (checked by grep).
- `pnpm test` (whole workspace) — 46 files pass, 10 skipped by design; **348 tests pass, 24 skipped** (integration and the spike peer skip without their environment). Web alone: 274.
- `HOMESERVER_URL=http://localhost:8008 npx vitest run --project web-integration push.integration` — **1 passed**: the gateway stub recorded two pushes for the invited and messaged account with keys `counts, devices, event_id, prio, room_id` and no forbidden field; the Synapse log shows `Received response to POST http://cs-push-stub:8010/_matrix/push/v1/notify: 200`.
- Spike runner in Chromium (spike build served by `vite preview`, compose Synapse): phase 1 `web_locks, secure_storage, wasm_crypto, crypto_setup, sync, encrypt_decrypt, reply_sent` PASS; peer `peer_roundtrip` PASS; after reload `session_restores, store_persists, history_persists, revocation, secure_storage_cleared` PASS. One defect found and fixed during this run: the history check read the cached timeline before decryption finished; it now waits and pages once, as the app does.
- Not run locally (no toolchain): Gradle and Xcode builds, the emulator and simulator spikes, the owner's phone checklist.
- CI (pushed 2026-10-24 on the owner's go-ahead): run 40109444999 (`2743ecd`) green on all four jobs, including the push-stub integration test and the e2e suite. Mobile workflow: #1 failed at `setup-android@v3` (moved to v4); #2/#3 at the committed `gradlew` lacking the executable bit (exit 126) and at spike scripts truncated by a patch (rewritten); #4 (`5037863`) built the APKs, Android stalled after `wasm_crypto`, iOS after `web_locks`; #5 (`90d4ef9`, 40111781663) named both causes through the new annotations: Android `TypeError: Promise.withResolvers is not a function` in the SDK's rust-crypto request loop (System WebView Chrome 113 on the API 34 image; the helper needs Chrome 119) and iOS `StorageError: An OS error occurred (-34018)` (errSecMissingEntitlement: the simulator build was unsigned).
- 2026-10-25, fixes `7643c78` (withResolvers shim, first import of the entry point, unit-tested) and `2e08330` (ad-hoc signed simulator build): run #6 (40164198142): iOS passed `secure_storage`, `crypto_setup`, `sync`, then the peer failed with `Invalid user_id: @spike-ios-…:localhost<CR>` (simctl console lines end in CRLF); the Android emulator step ended before the spike script ran (no evidence, cause unread). Fix `dd21d44` (strip the CR in both scripts; emulator job pinned to `ubuntu-24.04` with a runner annotation): **run #7 (40165486938) green on all three jobs** — Android emulator (API 34 x86_64, System WebView Chrome 113, runner image ubuntu24 20261023.334.3, KVM) **13/13 PASS**; iOS simulator (iOS 18.7, WKWebView) **13/13 PASS**; artifacts `android-apks`, `android-spike-evidence`, `ios-spike-evidence`. Local checks before each push: format, lint, typecheck, web unit (278 pass), build with `cap sync`.
- **Handoff checks** (2026-10-25, at the handoff commit): `pnpm format:check` pass; `pnpm lint` pass; `pnpm typecheck` pass; `pnpm test` 47 files pass, 10 skipped by design, **352 tests pass, 24 skipped** (integration and spike-peer suites skip without `HOMESERVER_URL`); `pnpm build` pass including `cap sync`. Integration and e2e suites were not rerun for the handoff (docs-only change); their last runs are the CI `dev-env` job on `dd21d44` (CI #35, green).

## Phase 5 exit gate (IMPLEMENTATION_PLAN.md)
| Criterion | Evidence so far | Outstanding |
|---|---|---|
| Android and iOS builds install and launch | CI: APKs built; the app installs and launches on the API 34 emulator and the iOS 18.7 simulator (run #7) | owner's phone install |
| Encrypted direct messaging works across web and mobile | spike `encrypt_decrypt` + `peer_roundtrip` PASS in Chromium, on the emulator and on the simulator with the web client's own code (run #7) | owner's phone ↔ web |
| Device verification and session revocation work as designed | spike `revocation` PASS on the emulator and the simulator; Phase 2/3 flows unchanged | owner's phone: verify from web, sign out from web |
| Push notifications do not expose message contents by default | gateway-boundary integration test; generic text in the app | delivery deferred (no credentials) — recorded |
| Offline and reconnection flows pass manual tests | Phase 3 web evidence; lifecycle hooks unit-tested | owner's phone: airplane mode, background/foreground |

Gate **open**: the automated device evidence is complete (Android emulator and iOS simulator 13/13, run #7); the owner's phone checklist is outstanding. iOS is simulator-only by the owner's decision (real device Blocked), so ADR-0001 C2 can close for Android only.

## Blockers and risks
- **R1 — Mobile E2EE on real devices untested**: emulator and simulator green (run #7); now narrowed to the owner's phone; iOS real device Blocked (no Mac/iPhone).
- **R5 — Toolchain pins** (TypeScript 6.0.3; pnpm `allowBuilds`); Capacitor 8 requires Android Studio 2025.2.1+ / Xcode 26 for anyone building locally.
- **R6 — Web key storage is origin-scoped IndexedDB** (TM-11); on mobile the SDK stores are WebView-resident (TM-23), disclosed.
- **R7 — Registration open on the dev homeserver only**; gating is Phase 7/8.
- **R8 — Pending (unsent) messages live in memory** (Phase 7).
- **R9 — Recipient's unverified devices read new messages** until the user acts (ADR-0004 D7).
- **R10 — Settings client-honoured except blocking** (ADR-0005 D2).
- **R12 — Push delivery deferred**: phones get no notifications until FCM/APNs credentials exist; the privacy screen says so.
- **R13 — Debug builds accept plain-http homeservers**; only development homeservers may be used with them (TM-27).
- The Mobile workflow's emulator job is pinned to `ubuntu-24.04` (run #6's emulator step failed on `ubuntu-latest` before the spike script ran, during the migration to Ubuntu 26; the cause is unread because job logs need sign-in); the iOS job depends on the `macos-26` image and its queue.
- Observation for the phone checklist: at startup the Android WebView logs Capacitor's own `Error injecting safe area CSS` (its `SystemBars` plugin, not project code); if the status bar overlaps content on the phone, record it in the device record.

## Deferred
| Item | Reason | Risk while deferred |
|---|---|---|
| FCM/APNs delivery, Sygnal, push plugin, device token provider | Credentials (owner) | Medium before beta (no mobile notifications) |
| Real-iPhone verification; signing and store configuration | No Mac/iPhone | Medium (iOS unverified on hardware) |
| App lock / biometrics | Not in scope | Low |
| Persisted send queue; HTTP-header CSP; registration gating | Phase 7 | as before |
| Discoverability, reports, moderation, account deletion | Phase 6 | as before |
| Firefox and Safari verification | Out of scope for the closed beta (owner, 2026-10-31; ADR-0005 D10) | Medium: users on those browsers are unsupported until a post-beta check |

## Decisions recorded 2026-10-31
- **Firefox and Safari are out of scope for the closed beta**; the beta supports Chromium-based browsers (ADR-0005 D10 amended).
- **The skipped-device behaviour (ADR-0003 D5: a device that skipped the recovery key returns to the setup screen on every start) is to be changed now**, plan first; ADR-0003 D5 will be amended with the approved design.
- `CLAUDE.md` imports `AGENTS.md` so Claude-based agents load the rules automatically; AGENTS.md stays tool-agnostic.

## Decisions recorded 2026-10-25
- **WebView floor**: one runtime shim, `Promise.withResolvers`, installed first in the entry point; everything else newer in the bundle is feature-checked by its caller (ADR-0006 D1).
- **CI simulator builds are signed ad hoc**; the emulator job is pinned to `ubuntu-24.04` (ADR-0006 D8).

## Decisions recorded 2026-10-24
- **Android via CI builds and the owner's phone; iOS simulator in CI only; push plumbing now, delivery later; stop and report if the spike fails** (owner).
- **Capacitor 8 shell with committed native projects; release/debug variants; CSP from configuration** (ADR-0006 D1, D2, D6).
- **Session record in platform secure storage; recovery key never stored** (ADR-0006 D3, amends the IMPLEMENTATION_PLAN wording).
- **Content-free pushers proven at the gateway boundary** (ADR-0006 D5).
- **The spike is a flagged build of the real client code** (ADR-0006 D7).

## Next approved action
Incoming agent: read `AGENTS.md`, this file and `docs/HANDOFF.md` §5 before anything else. Then: the owner sideloads `communication-system-debug.apk` from the `android-apks` artifact of Mobile run #7 (40165486938). That artifact bakes the emulator homeserver `http://10.0.2.2:8008`; for a phone on the LAN, dispatch the Mobile workflow with `homeserver_url` set to the PC's address (runbook §11) and take the APK from that run. Run the §11 checklist on the phone and fill the device record; the Phase 5 gate is then decided on that evidence (iOS real device Blocked; push delivery Deferred, both recorded). No Phase 6 work starts before the gate closes.

## Last updated
2026-10-25

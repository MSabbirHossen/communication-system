# Handoff — Communication System

**Written:** 2026-10-25 at commit `4427d24` on `main` (79 commits), by the outgoing AI contributor, for the next AI coding agent and the project owner.
**Rules of the road:** `AGENTS.md` (mandatory). **Live state:** `docs/STATUS.md`. This file is a snapshot; when the two disagree, STATUS wins and this file needs an update.
Status labels below follow AGENTS.md §12: **Implemented / Tested / Verified / Blocked / Deferred**.

## 1. Project summary and architecture

A privacy-focused, end-to-end-encrypted one-to-one messaging product for web, Android and iOS, built one gated phase at a time with the project owner approving each exit gate. Product requirements are in `docs/PRD.md`, technical requirements in `docs/TRD.md`, journeys in `docs/APP_FLOW.md`, design in `docs/UI_UX_BRIEF.md`, the phase plan in `docs/IMPLEMENTATION_PLAN.md`.

Architecture (ADR-0001, Accepted with conditions):

- **Matrix-first.** Messaging, rooms, membership, device keys, encryption and sync are owned by a Matrix homeserver (Synapse 1.163.x in development) and the official client SDK (`matrix-js-sdk` 44.0.0 with `@matrix-org/matrix-sdk-crypto-wasm` 18.9.0). The project writes no cryptographic or protocol code.
- **MongoDB for application data only.** The Express API (`apps/api`) today exposes only health and readiness; the collections it may own are limited to `docs/BACKEND_SCHEMA.md`. No messages collection, ever (ADR-0001 C4).
- **Web first.** `apps/web` (React, TypeScript, Vite) is the complete client: registration and sign-in, device setup with cross-signing, secret storage and key backup, encrypted direct messages, verification by emoji, sessions and revocation, settings, blocking, notifications, accessibility, RTL.
- **Capacitor mobile, provisional.** `apps/mobile` wraps the web client (Capacitor 8.5.3; native projects committed under `apps/mobile/android` and `apps/mobile/ios`). ADR-0001 C2 makes this provisional until the device spike passes on real devices; the fallback is native Kotlin/Swift on matrix-rust-sdk (`docs/architecture/MOBILE_SPIKE.md` option C). The CI spike is green on the Android emulator and the iOS simulator (ADR-0006, Proposed).
- Shared packages: `packages/design-tokens`, `packages/shared-types`, `packages/validation` (zod; env validation that names variables, never values), `packages/logger` (privacy-safe logging).

## 2. Current phase and exit gate

**Active phase: Phase 5 — Android and iOS.** Phases 0–4 are closed (ADR-0001 to ADR-0005 Accepted by the owner, dates in each ADR). Phase 5 is implemented and pushed; the Mobile workflow is green on `dd21d44` (run #7, id 40165486938); the Phase 5 gate is **open** pending the owner's phone checklist and gate decision.

| Phase 5 exit criterion (IMPLEMENTATION_PLAN) | Status | Evidence / what remains |
|---|---|---|
| Android and iOS builds install and launch | **Verified** on the CI Android emulator (API 34 x86_64, System WebView Chrome 113) and the CI iOS 18.7 simulator; **owner's phone: not yet done**; real iPhone **Blocked** (no Mac/iPhone) | Mobile run #7: `android-apks`, `android-spike-evidence`, `ios-spike-evidence` artifacts |
| Encrypted direct messaging works across web and mobile | **Verified** in CI: the spike (the web client's own code, flagged build) decrypts a message from a Node peer and replies encrypted; 13/13 checks on both platforms; **phone ↔ web manual check: not yet done** | `apps/web/src/spike/runner.ts`, `apps/web/test/spike/peer.test.ts` |
| Device verification and session revocation work as designed | **Verified** in CI: spike `revocation` on both platforms (device revoked from another client → app logged out, secure storage cleared); verification by emoji from web to the phone: **not yet done** (manual) | runbook §11 checklist |
| Push notifications do not expose message contents by default | **Verified** at the gateway boundary (`event_id_only` pusher; the stub gateway receives `counts, devices, event_id, prio, room_id` only); delivery to devices **Deferred** (no FCM/APNs credentials; owner decision) | `apps/web/test/integration/push.integration.test.ts`, `infrastructure/push-stub/server.mjs`, ADR-0006 D5 |
| Offline and reconnection flows pass manual tests | Web: **Verified** in Phase 3; mobile lifecycle hooks **Tested** (unit); airplane-mode and background/foreground on the phone: **not yet done** (manual) | `apps/web/src/platform/native.test.ts`, runbook §11 |

Owner decisions for Phase 5 (2026-10-24): Android = CI builds + the owner's phone; iOS = simulator in CI only (real device Blocked); push = plumbing now, delivery later; if the spike had failed = stop and report (it did not fail).

## 3. What is done (by phase, with commits)

| Phase | Outcome | Key commits |
|---|---|---|
| 0 — Architecture and E2EE proof of concept | Matrix chosen; two-account encrypted PoC against current Synapse, server-side plaintext inspection; mobile SDK research (`MOBILE_SPIKE.md`) | `9972177`, `485f8f5`, `37c3241`; ADR-0001 |
| 1 — Repository and foundation | pnpm workspace, strict TS, prettier/eslint, design tokens, logger, validation, API scaffold, web shell, Capacitor config, compose dev env, CI with secrets scan and dev-env job | `5584fd5` … `89d9d3d`; ADR-0002 |
| 2 — Identity and device security | session store and client factory, registration/login, cross-signing + secret storage + key backup bootstrap, session restore and refresh tokens, device list and revocation with re-auth, own-device SAS verification, hard-logout store deletion | `1ad0395` … `41491d4`; ADR-0003 |
| 3 — Encrypted direct messaging | conversation list and invitations, start a DM by identifier, encrypted conversation view with honest message states, history pagination and private read receipts, device warnings and identity-change notices, partner verification by emoji, two-account integration tests with server inspection | `1648408` … `fb84247`; ADR-0004 |
| 4 — Web experience | per-device tab lease, settings hub and profile, privacy settings honoured by the client, blocking via the Matrix ignore list, generic browser notifications, accessibility/keyboard/responsive/RTL polish, Playwright e2e with axe in CI, one token refresher per device shared across tabs | `b06c5d7` … `bff7576` (fix `7c605a3`); ADR-0005 |
| 5 — Android and iOS (gate open) | native projects and debug/release variants with CSP from config, session in native secure storage (recovery key never stored), lifecycle hooks, content-free push plumbing with a stub gateway, 13-check device spike runner, Mobile workflow (APK artifacts, emulator spike, simulator spike), docs | `135aab0`, `c101907`, `77be671`, `97d759f`, `5088e51`; CI fixes `22cf406`, `970e807`, `5037863`, `90d4ef9`, `7643c78`, `2e08330`, `dd21d44`; docs `2743ecd`, `4339019`, `4427d24`; ADR-0006 (Proposed) |

## 4. What is in progress

- **No code is half-finished.** The working tree at handoff is clean apart from this handoff commit; every check listed in §8 passed at `4427d24` (see §8 for the results recorded at handoff).
- **Manual, owner-side:** the Android phone checklist (runbook §11) and the device record table in `docs/runbooks/local-development.md` §11 ("Device record"). The run #7 APK bakes the emulator homeserver `http://10.0.2.2:8008`, which a phone cannot reach: dispatch the Mobile workflow with the `homeserver_url` input set to the PC's LAN address (plain http, debug build) and sideload `communication-system-debug.apk` from that run's `android-apks` artifact.
- **Decision pending:** ADR-0006 is Proposed; the Phase 5 gate decision belongs to the owner after the phone record exists.

## 5. Next steps, in order (each sized for one session)

1. **Record the phone results.** When the owner reports the §11 checklist: fill the device record (runbook §11), ADR-0006 §3 results table and `docs/STATUS.md` (gate table, R1). If anything failed on the phone, stop and report; propose a fix only if it is plumbing, and the native fallback (MOBILE_SPIKE.md option C) only if crypto, storage or restore failed on hardware.
2. **Present the Phase 5 gate.** Evidence summary per criterion (§2 above), ADR-0006 for acceptance, ADR-0001 C2 status per platform (Android satisfiable; iOS stays provisional, real device Blocked). The owner decides. On acceptance: mark ADR-0006 Accepted, close the gate in STATUS, update `docs/security/THREAT_MODEL.md` change history. Do not start Phase 6 before this.
3. **Phase 6 plan, plan-first.** Present a plan (AGENTS.md §3 step 2) for the application API and MongoDB per IMPLEMENTATION_PLAN Phase 6 and `docs/BACKEND_SCHEMA.md`: `user_profiles` (and `username_claims` only if the owner confirms the need, TRD §19.4), validated profile endpoints, abuse reports with restricted moderation access, audit events without secrets or plaintext, account deletion that is idempotent and safe after partial failure, indexes, migrations, authorization, rate limits, backup/retention procedures. Ask the owner the open decisions in §6 before implementing.
4. **Phase 6 implementation**, one small Conventional Commit per cohesive change, each landing with format, lint, typecheck, tests and build green; API integration tests against the compose MongoDB; authorization regression tests (AGENTS.md §8).
5. **Phase 7 items already queued** (do not pull forward without the owner): persisted send queue (STATUS R8), HTTP-header CSP and security headers (TM-11), registration gating (R7), app-log review for secrets (TM-02), making the CI dependency audit blocking (`ci.yml` "advisory until Phase 7"), locale persistence and translated tables (ADR-0005 §8).
6. **Push delivery** when the owner provides FCM/APNs credentials as repository secrets (never committed): Sygnal configuration recorded in ADR-0006 D5; device token provider and push plugin.

## 6. Decisions made, and decisions still open

Made (where recorded):

- Matrix-first architecture, Synapse self-hosted, federation disabled for beta, identity = Matrix user ID, push via `event_id_only` — ADR-0001 (`docs/architecture/ADR-0001-messaging-architecture.md`, Accepted 2026-10-20, conditions C1–C6 in §6).
- Mobile = Capacitor wrapper, provisional; React Native rejected (Hermes lacks what the crypto wasm needs); native matrix-rust-sdk is the fallback — `docs/architecture/MOBILE_SPIKE.md` (option D chosen), ADR-0001 C2, ADR-0006.
- Repository and tooling (pnpm, strict TypeScript, prettier, eslint, CI jobs) — ADR-0002. **The repository is public** (recorded in `ede1c88` / STATUS at the time): nothing secret may ever be committed; the development homeserver has open registration only locally and in CI.
- Identity, sessions, recovery: the user alone holds the recovery key; refresh tokens; hard logout deletes the device's crypto store; the SDK is not given the refresh token, the session controller is the sole refresher — ADR-0003, ADR-0005 D11.
- Direct messaging model, message states, verification UX, device warnings — ADR-0004.
- Web experience: Matrix-native settings, RTL and catalogue, generic notifications, cross-browser record — ADR-0005.
- Phase 5: two build variants (debug http origin + cleartext only in the debug build type; release https), session in platform secure storage, recovery key never stored, SDK stores stay in WebView IndexedDB (TM-23, disclosed in the privacy notes), content-free pushers, flagged spike build absent from production bundles, CI as the build and proof path; WebView floor shim (`Promise.withResolvers`), ad-hoc signed simulator builds, emulator job pinned to `ubuntu-24.04` — ADR-0006 (Proposed), THREAT_MODEL TM-12, TM-23, TM-27, TM-28.

Still open (owner):

- ADR-0006 acceptance and the Phase 5 gate (after the phone record).
- `username_claims` need (TRD §19.4); operational ownership of the homeserver, PostgreSQL, backups and push gateway (TRD §19.14); the other TRD §19 items listed as open in ADR-0001 §8 (5, 6, 7, 8, 11, 12, 13, 14).
- Invite-only beta vs open registration (THREAT_MODEL §7 item 3, Phase 8).
- FCM/APNs credentials and Sygnal hosting (push delivery).
- iOS on hardware (needs a Mac and an iPhone) and store/signing configuration.

## 7. Known risks, blockers and manual steps for the human

- **Docker Desktop** (Windows, WSL2 backend) is required for Synapse and MongoDB. It stops itself occasionally; restart it, wait for `docker info`, then `pnpm dev:env`. Generated Synapse config and secrets live in `infrastructure/synapse/data/` (git-ignored).
- **Public repository.** Never commit `.env` files, generated Synapse config, tokens or device data; the CI secrets scan is a backstop, not a guarantee. Job logs and artifacts need a signed-in GitHub session; the public run pages show annotations and step status, which the workflows print deliberately.
- **Mobile device testing.** Android: the owner's phone (runbook §11); the APK must be built with the phone-reachable homeserver URL (workflow dispatch input). iOS: simulator only; real iPhone Blocked. Debug builds accept plain-http homeservers (TM-27), so use them only against development homeservers.
- **Security review before real users** (Phase 7/8): app-log review (TM-02), dependency audit currently advisory, HTTP CSP and security headers, registration gating and rate limits, persisted send queue, threat-model refresh, and a review of the privacy disclosure (ADR-0001 C2a) before any mobile beta.
- **Operational risks recorded in STATUS:** R5 toolchain pins (TypeScript 6.0.3, pnpm `allowBuilds`), R6/TM-11 web key storage in origin-scoped IndexedDB, R9 unverified recipient devices receive new messages until the user acts (ADR-0004 D7), R10 settings client-honoured except blocking, R12 no mobile notifications until credentials exist, R13 debug builds and http.
- **CI runners:** the emulator job is pinned to `ubuntu-24.04` (a run on `ubuntu-latest` during the Ubuntu 26 migration failed before the spike started; cause unread); the iOS job depends on the `macos-26` image and its queue.
- Observation to check on the phone: the Android WebView logs Capacitor's own `Error injecting safe area CSS` at startup (its `SystemBars` plugin); if the status bar overlaps content, record it.

## 8. How to run everything

Requirements: Node 22 (`.nvmrc`), pnpm 12, Docker. Full detail and troubleshooting: `docs/runbooks/local-development.md`.

```bash
pnpm install --frozen-lockfile
```

Backing services (Synapse on 8008, MongoDB, push stub on 8010; the init script generates the Synapse config and development overrides):

```bash
pnpm dev:env:init && pnpm dev:env
```

Application configuration (placeholders work unchanged against the compose services; names only, never commit values):

```bash
cp apps/api/.env.example apps/api/.env && cp apps/web/.env.example apps/web/.env.local
```

- `apps/api/.env`: `CORS_ORIGINS`, `LOG_LEVEL`, `MONGODB_DB_NAME`, `MONGODB_URI`, `NODE_ENV`, `PORT`
- `apps/web/.env.local`: `VITE_API_URL`, `VITE_APP_ENV`, `VITE_HOMESERVER_URL`
- root `.env`: `COMPOSE_PROJECT_NAME`; `infrastructure/.env`: container `UID`/`GID` (runbook §14)
- Build-time only: `VITE_MOBILE_SPIKE=1` (spike build, never for production), `CS_MOBILE_VARIANT=debug|release`
- Test-time only: `HOMESERVER_URL` (integration, e2e, spike peer), `SPIKE_PEER_USER`, `SPIKE_PEER_LOG`, `SPIKE_OUT`, `NO_COLOR`
- CI/workflow: Mobile `workflow_dispatch` input `homeserver_url`; no repository secrets are required today.

Dev servers (API on 3000, web on 5173):

```bash
pnpm dev
```

Quality checks, the same set CI runs (typecheck and test build the shared packages first):

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Integration tests against the running compose Synapse (two-account messaging, sessions, push gateway):

```bash
HOMESERVER_URL=http://localhost:8008 pnpm test:integration
```

End-to-end (production build served by `vite preview`, Chromium, axe; install Chromium once with `pnpm --filter @cs/web exec playwright install chromium`):

```bash
pnpm test:e2e
```

Mobile (no Android SDK or Xcode on the development machine; native builds run in CI):

```bash
CS_MOBILE_VARIANT=debug pnpm --filter @cs/mobile build:web
```

Other: `pnpm dev:env:reset` regenerates the Synapse config; `pnpm poc` / `pnpm poc:inspect` run the Phase 0 proof of concept; `pnpm --filter @cs/mobile spike:report <logs…>` summarises a spike log capture.

CI (`.github/workflows/ci.yml`, on push to `main`): `checks` (format, lint, typecheck, unit tests, build, spike-marker absence in the production bundle, advisory dependency audit), `secrets-scan`, `dev-env` (compose Synapse + MongoDB + push stub, API readiness, Phase 0 PoC, Phase 2–3 integration tests, Phase 4 e2e, server plaintext inspection, annotations, evidence artifact), and a PoC job against current Synapse. Mobile (`.github/workflows/mobile.yml`, on push to `main` touching `apps/**`, `packages/**`, `infrastructure/**`, the workflow or the lockfile, and on dispatch): `android-build` (debug, spike and release assemble; `android-apks` artifact), `android-spike` (compose Synapse + emulator API 34 + Node peer; evidence artifact), `ios-simulator` (pip Synapse, ad-hoc signed Debug build, simulator spike; evidence artifact). Results are published as annotations on the public run pages.

Results recorded at handoff (2026-10-25, Windows 11, Node 22.20, pnpm 12.14): see `docs/STATUS.md` → Verification → "Handoff checks".

## 9. Non-negotiable rules (AGENTS.md is the full policy)

- No custom cryptography or protocol code; only the supported SDK and homeserver.
- No plaintext fallback, silent or otherwise; test encryption at the protocol boundary.
- No secrets, tokens, recovery material or decrypted message content in logs, errors, analytics, tests, commits or this repository (it is public).
- No messages collection in MongoDB; no duplication of Matrix rooms, membership, keys or sync state (ADR-0001 C4; `docs/BACKEND_SCHEMA.md` is the allow-list).
- One phase at a time; plan first for non-trivial work; owner approval at every exit gate; never move phase status to look faster.
- Honest reporting with the §12 labels; never claim a build, test or CI result that did not run; record deferred work with its risk.
- Small Conventional Commits, each landing with format, lint, typecheck, tests and build green; commit only when authorized; push only on the owner's go-ahead; never rewrite shared history.
- Keep `docs/STATUS.md`, the ADRs and `docs/security/THREAT_MODEL.md` true after every meaningful change.

## 10. Pitfalls learned (things that cost time)

Environment (Windows 11, non-elevated shell):

- Docker Desktop stops itself now and then; `docker info` must succeed before `pnpm dev:env`. The Phase 0 pip/venv Synapse route on Windows is obsolete (kept in `poc/matrix-e2ee/README.md` for history); use compose.
- Local Synapse config is `infrastructure/synapse/data/homeserver.yaml` (git-ignored); editing it and `docker compose -f infrastructure/docker-compose.yml restart synapse` takes about 20 s. For the session-expiry integration test, CI uses a 10 s `refreshable_access_token_lifetime`; locally keep 5 m, or close app tabs first (a 10 s lifetime makes an open tab refresh in a tight loop).
- Patching files from a shell heredoc mangles backslashes (`\r`, `\n` become real bytes); write a patch script to a file and run it (`python -I`). Prettier rewraps Markdown and strings, so anchor patches on short unique fragments. Git warns about LF→CRLF on Windows; harmless.
- Playwright: the installed Chromium must match `@playwright/test`; a killed install leaves `%LOCALAPPDATA%\ms-playwright\__dirlock` to delete. Headless Chromium reports the notification permission as denied even when granted. Run the integration and e2e suites one at a time (a messaging integration test flaked once under parallel load).
- Two-device browser checks: use distinct localhost subdomains (for example `second.localhost:5173`) against the same Vite server; each is its own origin with its own IndexedDB. Vite HMR after a source edit reloads every tab and wipes unsent composer text.
- Use throwaway dev accounts only; never act on the owner's own account (`@ms:localhost` on the local homeserver).

Matrix and the SDK:

- A refresh token is single-use: with both the SDK and the app refreshing, the second rotation fails under short lifetimes. The SDK is not given the refresh token; the controller refreshes and other tabs adopt the rotated tokens (`7c605a3`, ADR-0005 D11).
- After a soft logout, rebuild the client; a stopped Rust crypto backend cannot be restarted (`36f0443`).
- Read the timeline only after a live sync and decryption; history checks that read the cached timeline early see undecrypted events (`bf05ac6`, spike `history_persists`).
- Synapse rejects an `http` push gateway on a private network unless `ip_range_whitelist` covers the compose subnet (`infrastructure/synapse/dev-overrides.yaml`).

CI and mobile:

- `android-actions/setup-android@v3` no longer runs on current runners (use v4); the committed `gradlew` needs the executable bit (`git update-index --chmod=+x`) and the workflow also `chmod`s it.
- The API 34 emulator image ships System WebView Chrome 113: `Promise.withResolvers` (used unguarded by matrix-js-sdk 44) needs the shim in `apps/web/src/platform/polyfills.ts`, imported first in `apps/web/src/main.tsx`.
- An iOS simulator build made with `CODE_SIGNING_ALLOWED=NO` has no entitlements and the Keychain answers `-34018`; sign ad hoc (`CODE_SIGN_IDENTITY=- CODE_SIGNING_REQUIRED=NO`).
- `simctl launch --console-pty` output ends lines with CRLF; strip `\r` before using captured values.
- `ubuntu-latest` is migrating to Ubuntu 26 (from 2026-10-19); the emulator job is pinned to `ubuntu-24.04`.
- Without sign-in, GitHub shows run pages, job step status and annotations but no logs or artifacts; the anonymous API allows 60 requests per hour per IP, so the workflows print `::notice`/`::warning`/`::error` annotations with the facts needed to diagnose a failure, and the spike scripts capture evidence on every exit path (traps).
- The spike scripts must print `CS_SPIKE step …` markers and `CS_SPIKE error …` with the stack head; without them a stall is undiagnosable from annotations alone.

# Project Status

## Active phase
Phase 3 — One-to-one encrypted messaging (**planning only; no implementation until the owner approves the plan**)

## Last completed milestone
**Phase 2 complete — exit gate accepted by the owner on 2026-10-23; ADR-0003 Accepted.** Eight planned commits plus one fix on local `main` on top of `89d9d3d` (the Phase 1 tip): session store and client factory `1ad0395`, registration and login `160cd97`, secure device setup with recovery key and key backup `585869e`, session lifecycle with app-driven token refresh `83c1a54`, device list and revocation `31175f5`, own-device SAS verification and security notices `a5e4908`, refresh-token config and integration tests in CI `cd7a2e7`, crypto-store wipe fix `33de740`, documentation `db2174a`, and two CI follow-ups: build-order fix `18f7a40` and integration-test annotations. **Pushed 2026-10-23.** First CI run 39929104030 failed in `pnpm build`: the mobile package rebuilt the web app concurrently with the workspace build and before the shared packages existed (reproduced in a Linux container; two concurrent bundles of matrix-js-sdk were killed). Fixed in `18f7a40`; run 39932188651 on that commit is green on all four jobs (checks, secrets-scan, dev-env with the Phase 2 integration tests, poc-e2ee).

Phase 1 closed 2026-10-23 (CI run 39899908581 green on `9972177`; owner's runbook walkthrough passed). Phase 0 approved with conditions 2026-10-20 (ADR-0001 Accepted).

## Current task
Phase 3 plan for owner approval (AGENTS.md step 2), checked against the Phase 3 exit gate in IMPLEMENTATION_PLAN.md. No Phase 3 code until approved.

## Completed (Phase 2)
Labels follow AGENTS.md §12. Unit = jsdom/Node tests without a network; integration = Node against the compose Synapse 1.163.1 (`pnpm test:integration`); manual = built-in browser against the local dev server, two origins (`localhost`, `second.localhost`) as two devices.

| Deliverable | Status | Evidence |
|---|---|---|
| Session store (`cs-session` IndexedDB, versioned, no `localStorage`; explicit error when storage is unavailable) and Matrix client factory (per-device sync and Rust crypto stores) | Verified | unit (fake-indexeddb; store startup order; crypto prefix); manual (databases per device) |
| Registration (UIA `m.login.dummy` only, else unsupported) and login with refresh tokens; generic invalid-credentials message; server-side username rejection; rate-limit retry-after surfaced | Verified | integration (register, login, wrong password = unknown user, taken and invalid usernames); unit (error mapping never includes free text); manual (wrong password message) |
| Secure device setup: cross-signing (UIA password when required), secret storage with a recovery key shown once (copy/download/acknowledge), server-side key backup; additional device restores with the key (wrong key rejected, 5 attempts) or skips and stays unverified | Verified | integration (created; restored after a wrong key; skipped); manual (key shown once; restore on a second device; skip path) |
| Session lifecycle: restore on start, proactive refresh 60 s before expiry, refresh before use, retry on network failure, soft logout → refresh + restart sync, hard logout → wipe stores and route to sign-in with "session expired", sign-out | Verified | unit (fake timers; dedupe; rejection → signed out); integration (expiry → `soft_logout` → refresh at a 10 s lifetime; used refresh token rejected; logout → `M_UNKNOWN_TOKEN`); manual (reload restores the session; `POST /refresh → 200` observed) |
| Devices & security screen: current session first, fingerprints, Verified / Not verified / Unknown / No keys from SDK state only, rename, revoke with confirmation and password re-authentication (cancel changes nothing) | Verified | unit; integration (revoke needs the password; cancelled UIA leaves the device; revoked client observes a hard logout); manual (`DELETE /devices/<id>` 401 → UIA → 200; revoked tab lands on sign-in) |
| Own-device verification (SAS `m.sas.v1`): request from the device list, incoming request notice, seven emoji compared with explicit match/mismatch, cancel keeps the warning, leaving the screen cancels | Verified | unit (flow state machine with a faked verifier; screen paths); integration (two Node clients: match → verified; mismatch → `m.mismatched_sas`, stays unverified); manual (two origins: identical emoji, both Verified afterwards) |
| Security notices: new device on the account, master cross-signing key replaced (snapshot comparison, no false alarms on trust changes), key backup disabled, incoming verification request | Verified (new device, verification request) / Tested (identity change, backup disabled: unit only) | unit; manual (new-device and verification-request notices seen on the other origin) |
| Hard logout wipes the device's crypto store (fix `33de740`: the SDK needs the per-device prefix) | Verified | unit (prefix asserted); manual (after revocation only the empty `cs-session` database remains; SDK log shows the per-device store removed) |
| Dev Synapse refresh tokens (5 m access / 30 d refresh); CI dev-env job runs the integration tests at a 10 s access-token lifetime, fails if any test is skipped, and publishes the counts as annotations | Verified in CI | run 39932845775 on `546195b`: annotation `Test Files 3 passed (3); Tests 9 passed (9)` on Synapse 1.163.1; the step fails if any test is skipped |
| ADR-0003 (storage, token model, logout semantics, setup and recovery model, "Verified" meaning, UIA, notices), THREAT_MODEL (TM-03/06/08/10 Verified, TM-11/16 updated, TM-24/25 added), runbook §8 Phase 2 checklist | Implemented | `docs/architecture/ADR-0003-identity-sessions-and-recovery.md` (Status: Proposed, for owner approval) |

## Verification
Executed 2026-10-23 on Windows 11, Node 22, pnpm 12, TypeScript 6.0.3, Docker Desktop (Synapse 1.163.1, MongoDB 7):

- `pnpm format:check`, `pnpm lint`, `pnpm typecheck` (now includes `apps/web/test/integration`) — pass.
- `pnpm test` — 23 files, **174 tests pass**; the 3 integration files (9 tests) are skipped offline by design.
- `HOMESERVER_URL=http://localhost:8008 ACCESS_TOKEN_LIFETIME_MS=10000 pnpm test:integration` with the local Synapse temporarily at `refreshable_access_token_lifetime: 10s` (restored to 5m afterwards) — 3 files, **9 tests pass** (about 20 s).
- `pnpm build` — pass (packages, api, web, mobile).
- Manual (built-in browser, `pnpm --filter @cs/web dev`): the two-origin checklist in `docs/runbooks/local-development.md` §8, steps 1–4, performed on account `@cs-alice-2310a:localhost` (throwaway local account): new-device notice, Verify → Review → Continue → identical emoji (🔔👍🏆🌙🐘☎️🐓) → "Device verified" on both, both lists Verified with matching fingerprints; revocation with password UIA → the other origin shows "Your session has expired" and keeps only an empty `cs-session` database; session restored on reload; wrong password → generic message. The recovery-key restore on a second device (step 5) was verified earlier in the same session (outcome `restored`, device Verified) before the verification screens existed.
- CI: run 39929104030 (`db2174a`) failed in `pnpm build` (build-order race, see above); run 39932188651 (`18f7a40`) green on all four jobs; run 39932845775 (`546195b`, integration step hardened) green: checks, secrets-scan, dev-env (API `/ready` 200, PoC 31/31, inspection 8/8, integration 3 files / 9 tests passed on Synapse 1.163.1), poc-e2ee. https://github.com/MSabbirHossen/communication-system/actions/runs/39932845775
- Not performed manually: identity-change and backup-disabled notices (unit-tested only; they need a cross-signing reset, which the UI does not offer).

## Phase 2 exit gate (IMPLEMENTATION_PLAN.md)
| Criterion | Evidence |
|---|---|
| Registration and login work for valid users | integration + manual |
| Invalid credentials and expired sessions are handled safely | generic error (integration, unit, manual); expiry → refresh or sign-in without content (integration, unit, manual revocation) |
| Device identity and verification status are visible | device list with fingerprints and SDK-derived badges (unit, integration, manual); own identity panel |
| Revoking a device prevents its subsequent authorized use as designed | revoked token `M_UNKNOWN_TOKEN`, client hard-logs out, stores wiped (integration, manual) |
| No credentials or private keys appear in logs or ordinary database records | logger scrubber tests (Phase 1); the web client never writes to MongoDB; recovery key never persisted (unit asserts the holder is cleared; integration asserts `holder.has() === false` after setup); passwords live only in component state and UIA requests |
| Authentication, authorization and session lifecycle tests pass | 174 unit + 9 integration locally; CI runs 39932188651 and 39932845775 green |

Gate **closed 2026-10-23**: evidence accepted by the owner; ADR-0003 Accepted.

## Blockers and risks
- **R1 — Mobile E2EE on real devices untested** (ADR-0001 C2, Phase 5); the WebView key-storage question (TM-23) is untouched by Phase 2.
- **R5 — Toolchain pins** (TypeScript 6.0.3 for typescript-eslint; pnpm `allowBuilds`).
- **R6 — Web key storage is origin-scoped IndexedDB** (TM-11): production CSP and headers are Phase 4/7; disclosed in the privacy notes.
- **R7 — Registration is open on the dev homeserver only**; real-user gating (token/invite, email) is Phase 7/8 (TM-13).
- An unverified device that skipped the recovery key returns to the setup screen on every start until verified or restored (deliberate reminder; may need softening in Phase 4 UX review).
- Verification notices cover the user's own devices only; other users' devices surface in Phase 3.
- `pnpm audit` remains advisory until Phase 7.

## Deferred
| Item | Reason | Risk while deferred |
|---|---|---|
| Sign out everywhere | Phase 4 settings (needs UIA; per-device revocation covers the need) | Low |
| Other users' device verification in the UI; room-level "block unverified devices" | Phase 3 | Medium (messaging warnings depend on it) |
| Playwright browser end-to-end tests | Phase 4 (Node integration + Testing Library cover Phase 2) | Low |
| MFA, registration tokens / invite-only, email verification, CAPTCHA | Phases 7/8 | Medium before any real users |
| Passphrase-protected secret storage | Not needed for the beta (recovery key only) | Low |
| Native Android/iOS projects and device spike | Phase 5 (ADR-0001 C2) | Medium (documented fallback) |

## Decisions recorded 2026-10-23
- **Recovery model:** recovery key + server-side encrypted key backup (owner decision); no account-password recovery in the beta (ADR-0003 D6).
- **Multi-device at launch** with own-device emoji (SAS) verification (owner decision; ADR-0003 D7).
- **Token model:** refresh tokens with 5-minute access tokens, refreshed by the app because the SDK refreshes only OAuth sessions (ADR-0003 D3).
- **Hard logout wipes the device's stores; soft logout keeps them** (ADR-0003 D4).
- Repository stays public (final, 2026-10-23); Capacitor for mobile remains provisional (ADR-0001 C2).

## Next approved action
Produce the Phase 3 plan (plan mode, no code) and present it for approval. Implementation starts only after the owner approves the plan.

## Last updated
2026-10-23

# Project Status

## Active phase
Phase 0 — Architecture validation and project foundation (**exit gate awaiting owner approval**)

## Last completed milestone
The Phase 0 encrypted-messaging proof of concept passed against **current Synapse 1.163.0 in CI** (official `ghcr.io/element-hq/synapse:latest` image, unmodified): 31/31 client checks and 8/8 server-side inspection checks, in two consecutive green runs. It had already passed twice locally against Synapse 1.67.0. Mobile spike research completed with one recommendation. Repository committed and pushed; CI is green on `main`.

## Current task
Phase 0 exit-gate review (third round). Remaining open items are owner decisions, not blocked work.

## Completed
Labels follow AGENTS.md §12: Implemented / Tested / Verified / Blocked / Deferred.

| Deliverable | Status | Evidence |
|---|---|---|
| `docs/APP_FLOW.md` at canonical path; `AGENTS.md` at repo root (moved by owner) | Implemented | file locations |
| ADR-0001 Matrix vs custom backend | Implemented, **Proposed** (needs owner approval) | `docs/architecture/ADR-0001-messaging-architecture.md` |
| Threat model baseline, updated with PoC and mobile results | Implemented | `docs/security/THREAT_MODEL.md` |
| Two accounts register and sign in | Verified (local + CI) | `evidence/poc-run-5-clean.txt` step 1; CI annotations |
| Device identity (ed25519 fingerprints) and manual verification | Verified (local + CI) | step 3 |
| Encrypted DM sent, decrypted on two recipient devices | Verified (local + CI) | step 4 |
| Server stores `m.room.encrypted` only; plaintext absent from DB file and log | Verified on Synapse 1.67.0 (local) **and 1.163.0 (CI)** | `evidence/inspect-run-5-clean.txt`, `evidence/stored-event-clean-run.json`, RESULTS.md §8 |
| No silent plaintext fallback | Verified (local + CI) | step 9 |
| Network interruption: RECONNECTING → SYNCING, no duplicates | Verified (local + CI) | step 5 |
| Idempotent retry (client txnId guard + server returns same event_id) | Verified (local + CI) | step 6 |
| Late-enrolled device cannot decrypt earlier history | Verified (local + CI) | step 7 |
| Logout revokes token | Verified (local + CI) | step 8 |
| Repeatable from clean state | Verified | local runs c53fc0cd / 77a2f5ca; CI runs 39491618424 / 39492012245 (fresh runner each time) |
| Crypto library: matrix-js-sdk 44.0.0 + @matrix-org/matrix-sdk-crypto-wasm 18.9.0, Apache-2.0, not deprecated, Rust stack is the only supported backend | Verified | npm registry, official README (2026-10-20) |
| Re-run against current Synapse in Docker **on this machine** | **Blocked** — Docker/WSL2 not installed | RESULTS.md §8 |
| Re-run against current Synapse in Docker **in CI** | **Verified** | RESULTS.md §8; run 39492012245 |
| Lint, typecheck, unit tests | Verified (local and CI) | `checks` job green |
| CI workflow | Verified — green on `main` at `3f6679e` | https://github.com/MSabbirHossen/communication-system/actions |
| Mobile: React Native + wasm crypto on Android emulator | **Blocked** — no JDK/Android SDK/emulator on this machine; not tested | `MOBILE_SPIKE.md` §2, §6 |
| Mobile: alternatives evaluated from official sources, comparison and one recommendation (Capacitor wrapper) | Implemented (research); device behaviour **untested** | `MOBILE_SPIKE.md` §4–§5 |
| Production build | Deferred — no application yet; `pnpm build` is a placeholder | root `package.json` |

## Verification
Commands executed on 2026-10-20 (Windows 11, non-elevated, Node 22.20.0, pnpm 12.9.1, Python 3.13.7):

- `pnpm lint` — pass. `pnpm typecheck` — pass (0 errors). `pnpm test` — pass (11 tests). Same three green in CI.
- `pnpm poc` locally — runs c53fc0cd and 77a2f5ca (clean DB): 31/31 each. `pnpm poc:inspect` — 8/8 each.
- CI `poc-e2ee` job — runs 39491618424 and 39492012245 green: Synapse 1.163.0, 31/31 PoC, 8/8 inspection (first run lacked the container-log scan: 7/7). Five earlier CI runs failed on workflow issues, each fixed in its own commit (`29d6125`, `0b686f5`, `a6366c0`, `ee751c2`, `1fd9c6b`); see RESULTS.md §8.
- Results are readable without signing in through check annotations (GitHub hides logs and job summaries from anonymous viewers).
- Environment checks: `docker`, `wsl`, `gh`, `java`, `adb`, `emulator`, `sdkmanager` all missing locally.

## Commits on `main`
`5d303ac` Phase 0 deliverables · `29d6125`, `0b686f5`, `a6366c0`, `ee751c2`, `1fd9c6b`, `3f6679e` CI fixes · (this status update)

## Blockers and risks
- **B1 — Owner approval** for ADR-0001, the Capacitor mobile recommendation (PRD §12 change) and the Phase 0 exit gate.
- **B2 — Docker Desktop is not installed locally.** Not a gate blocker any more (CI covers current Synapse), but Phase 1 needs a local dev homeserver: install Docker Desktop with the WSL2 backend (elevated shell, reboot).
- **B4 — Android toolchain absent**; the on-device React Native test cannot run here. Superseded by the recommendation to drop React Native; the Phase 5 device spike targets Capacitor WebViews instead.
- **R1 — Mobile E2EE path untested on devices.** Recommendation: Capacitor wrapper of the web client; needs the Phase 5 device spike (ADR C2).
- **R3 — AGPL homeserver.** Unmodified self-hosting carries no obligation; Continuwuity is the Apache-2.0 fallback.
- Resolved this round: B3 (repo pushed), R2 (CI verified green), C6 (current-Synapse verification).

## Deferred
- Local current-Synapse run — until Docker Desktop is installed.
- On-device mobile spike — Phase 5 (Capacitor WebViews), or earlier if the owner wants the React Native failure recorded on a device.
- Persistent crypto store in the PoC, key backup / secret storage behaviour — Phase 2.
- Production build and app scaffolding — Phase 1.

## Next approved action
None approved. Awaiting the owner's decision on ADR-0001, the mobile recommendation and the Phase 0 exit gate. Phase 1 is not started.

## Last updated
2026-10-20

# Project Status

## Active phase
Phase 0 — Architecture validation and project foundation (**exit gate not approved**)

## Last completed milestone
Phase 0 encrypted-messaging proof of concept executed twice against a local Synapse (second run from a wiped database): 31/31 client checks and 9/9 server-side inspection checks passed. Mobile spike research completed with a single recommendation. Evidence: `poc/matrix-e2ee/RESULTS.md`, `poc/matrix-e2ee/evidence/`, `docs/architecture/MOBILE_SPIKE.md`.

## Current task
Phase 0 exit-gate review (second round). Two gate items remain blocked by the environment (see Blockers); the mobile recommendation awaits the owner's decision.

## Completed
Labels follow AGENTS.md §12: Implemented / Tested / Verified / Blocked / Deferred.

| Deliverable | Status | Evidence |
|---|---|---|
| `docs/APP_FLOW.md` at canonical path; `AGENTS.md` at repo root (moved by owner) | Implemented | file locations |
| ADR-0001 Matrix vs custom backend | Implemented, **Proposed** (needs owner approval) | `docs/architecture/ADR-0001-messaging-architecture.md` |
| Threat model baseline, updated with PoC and mobile results | Implemented | `docs/security/THREAT_MODEL.md` |
| Two accounts register and sign in | Verified | `evidence/poc-run-5-clean.txt` step 1 |
| Device identity (ed25519 fingerprints) and manual verification | Verified | step 3 |
| Encrypted DM sent, decrypted on two recipient devices | Verified | step 4 |
| Server stores `m.room.encrypted` only; plaintext absent from DB file and log | Verified (Synapse 1.67.0 with Windows shims) | `evidence/inspect-run-5-clean.txt`, `evidence/stored-event-clean-run.json` |
| No silent plaintext fallback (crypto-less client refused; encryption error → `not_sent`; server event count unchanged) | Verified | step 9 |
| Network interruption: client reports RECONNECTING, recovers, no duplicates | Verified | step 5 |
| Idempotent retry (client txnId guard + server returns same event_id) | Verified | step 6 |
| Late-enrolled device cannot decrypt earlier history | Verified | step 7 |
| Logout revokes token | Verified | step 8 |
| Repeatable from clean state | Verified | run c53fc0cd vs run 77a2f5ca (wiped DB) |
| Crypto library: matrix-js-sdk 44.0.0 + @matrix-org/matrix-sdk-crypto-wasm 18.9.0, Apache-2.0, not deprecated, Rust stack is the only supported backend | Verified | npm registry, official README (2026-10-20) |
| Re-run against current Synapse in Docker on this machine | **Blocked** — Docker/WSL2 not installed | RESULTS.md §8 |
| Lint, typecheck, unit tests | Tested (pass locally) | `pnpm lint`, `pnpm typecheck`, `pnpm test` |
| CI workflow (checks + PoC against current Synapse in Docker) | Implemented, YAML validated, **never executed** — remote has no commits | `.github/workflows/ci.yml` |
| Mobile: React Native + wasm crypto on Android emulator | **Blocked** — no JDK/Android SDK/emulator on this machine; not tested | `MOBILE_SPIKE.md` §2, §6 |
| Mobile: alternatives evaluated from official sources, comparison and one recommendation (Capacitor wrapper) | Implemented (research); device behaviour **untested** | `MOBILE_SPIKE.md` §4–§5 |
| Production build | Deferred — no application yet; `pnpm build` is a placeholder | root `package.json` |

## Verification
Commands executed on 2026-10-20 (Windows 11, non-elevated, Node 22.20.0, pnpm 12.9.1, Python 3.13.7):

- `pnpm lint` — pass (0 problems). `pnpm typecheck` — pass (0 errors, strict, checkJs). `pnpm test` — pass (11 tests).
- `pnpm poc` — runs c53fc0cd and 77a2f5ca (clean DB): 31/31 each. Three earlier runs aborted on test-harness bugs, fixed in the PoC (documented in RESULTS.md).
- `pnpm poc:inspect` on the SQLite DB and log after each passing run — 9/9.
- CI YAML parsed with PyYAML (2 jobs, 8 + 9 steps). Not executed.
- Environment checks for the owner's requests: `docker` missing; `wsl` not installed; `winget list Docker.DockerDesktop` empty; `git ls-remote origin` succeeds but lists no branches (no commits anywhere); `gh` missing; `java`, `adb`, `emulator`, `sdkmanager` missing; `curl` to npm and GitHub failed with `CRYPT_E_REVOCATION_OFFLINE` during the session (npm itself worked).

## Blockers and risks
- **B1 — Owner approval** for ADR-0001, the mobile recommendation and the Phase 0 exit gate.
- **B2 — Docker Desktop is not installed** on this machine (contrary to the assumption in the second request). Needed for the local current-Synapse re-run and the Phase 1 dev homeserver. Installing it needs an elevated shell, the WSL2 backend and a reboot.
- **B3 — Nothing is committed or pushed.** `origin` points at `github.com/MSabbirHossen/communication-system` but the repo has zero commits locally and remotely, so CI cannot run. Committing is not authorized for the AI contributor (AGENTS.md §9); the owner must commit and push, or authorize a commit. `gh` is not installed, so CI results would be read through the browser.
- **B4 — Android toolchain absent**; the on-device React Native test cannot run here (MOBILE_SPIKE.md §6 lists what to install).
- **R1 — Mobile E2EE path untested on devices.** Recommendation: Capacitor wrapper of the web client; React Native ruled out for now (Hermes WebAssembly is a non-production preview). Needs the Phase 5 device spike (ADR C2) and a PRD §12 scope change.
- **R2 — CI unverified.** First run may need adjustment.
- **R3 — AGPL homeserver.** Unmodified self-hosting carries no obligation; Continuwuity is the Apache-2.0 fallback.

## Deferred
- Current-Synapse local run and CI green run — until Docker is installed and the repo is pushed.
- On-device mobile spike — until an Android toolchain (or a CI emulator job after push) is available.
- Persistent crypto store in the PoC, key backup / secret storage behaviour — Phase 2.
- Production build and app scaffolding — Phase 1.

## Next approved action
None approved. Recommended for the owner, in order: (1) install Docker Desktop (WSL2 backend) and reboot; (2) commit and push the repository, or authorize the AI contributor to commit; (3) decide on the Capacitor mobile recommendation; then the AI re-runs the PoC against current Synapse locally and watches the first CI run.

## Last updated
2026-10-20

# Project Status

## Active phase
Phase 1 — Repository, environments and application foundation (**planning only; implementation not approved yet**)

## Last completed milestone
**Phase 0 complete — exit gate approved by the project owner on 2026-10-20 with conditions** (ADR-0001 §6: Capacitor mobile wrapper provisional, Phase 5 real-device spike, native Kotlin/Swift fallback, WebView key-storage limitation in the privacy disclosure).

Evidence: encrypted direct-messaging PoC passed locally against Synapse 1.67.0 (runs c53fc0cd, 77a2f5ca) and in CI against official Synapse 1.163.0 (runs 39491618424, 39492012245, 39492635206): 31/31 client checks and 8/8 server-inspection checks each. `poc/matrix-e2ee/RESULTS.md`, `poc/matrix-e2ee/evidence/`, `docs/architecture/MOBILE_SPIKE.md`.

## Current task
Phase 1 plan for owner approval (AGENTS.md step 2). No Phase 1 code until approved.

## Completed
Labels follow AGENTS.md §12.

| Deliverable | Status |
|---|---|
| ADR-0001 Matrix vs custom backend | **Accepted with conditions** (2026-10-20) |
| Threat model baseline (TM-01…TM-23) | Implemented; PoC-backed rows Verified |
| Mobile spike research and recommendation | Implemented; device behaviour untested (deferred, see below) |
| PRD §11/§12, TRD §2.1/§4.2, IMPLEMENTATION_PLAN §2/Phase 5, AGENTS §5.2 updated for Capacitor | Implemented |
| E2EE PoC: accounts, device identity, encrypted DM, two-device decrypt, no plaintext fallback, network interruption, idempotent retry, late-device isolation, logout | Verified (local + CI) |
| Server stores ciphertext only (DB file and log scanned) | Verified on Synapse 1.67.0 and 1.163.0 |
| Crypto library (matrix-js-sdk 44.0.0 + crypto-wasm 18.9.0, Apache-2.0, not deprecated) | Verified |
| Lint, typecheck, unit tests, CI workflow | Verified green on `main` |

## Verification
- CI: https://github.com/MSabbirHossen/communication-system/actions — `checks` and `poc-e2ee` jobs green since commit `1fd9c6b`; results published as check annotations.
- Local: `pnpm lint`, `pnpm typecheck`, `pnpm test` pass (2026-10-20).

## Blockers and risks
- **R1 — Mobile E2EE on real devices is untested.** Mitigation: ADR-0001 C2 device spike opens Phase 5; fallback is native Kotlin/Swift on matrix-rust-sdk. Risk: Phase 5 estimate grows if the spike fails.
- **R3 — AGPL homeserver.** Unmodified self-hosting carries no obligation; Continuwuity is the Apache-2.0 fallback (ADR-0001 C5).
- **R4 — WebView key storage** (TM-23): keys without hardware backing on mobile; must be in the privacy disclosure (C2a) and revisited if the beta shows a need for native apps.

## Deferred
| Item | Reason | Risk while deferred |
|---|---|---|
| Local run of the PoC against current Synapse in Docker on the development machine | Docker Desktop and WSL2 are not installed; installation needs an elevated shell and a reboot. The owner will install Docker Desktop before Phase 1 implementation. | Low: the same PoC is verified in CI against Synapse 1.163.0. Phase 1's local dev homeserver depends on Docker being present. |
| On-device mobile test (React Native + wasm crypto on an Android emulator) | No JDK, Android SDK or emulator on the machine; React Native was dropped by ADR-0001, so the test would not inform the chosen path. Replaced by the Phase 5 real-device Capacitor spike. | Medium: the Capacitor path's WebView behaviour (wasm, IndexedDB persistence, session restore) is unverified until Phase 5; fallback documented. |
| Persistent crypto store, key backup and secret storage behaviour | Phase 2 scope. | Low. |
| Production build | No application packages yet; `pnpm build` is a placeholder until Phase 1. | Low. |

## Next approved action
Owner approval of the Phase 1 plan. Implementation starts only after that.

## Last updated
2026-10-20

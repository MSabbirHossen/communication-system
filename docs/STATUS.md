# Project Status

## Active phase
Phase 3 — One-to-one encrypted messaging (**implemented, verified locally and in CI; exit gate awaiting the owner's acceptance**)

## Last completed milestone
**Phase 2 complete — exit gate accepted by the owner on 2026-10-23; ADR-0003 Accepted.** CI green on `41491d4`. Phase 1 closed 2026-10-23; Phase 0 approved with conditions 2026-10-20 (ADR-0001 Accepted).

**Phase 3 implemented (2026-10-23)** as the seven planned commits plus fixes on local `main` on top of `41491d4`: conversation list and invitations `1648408`, start by identifier `5ae72d5` (+ `36d6ac2` test typing), conversation view with honest states `1dc666d`, pagination and private receipts `a81bc99`, recipient security and decryption explanations `3dd8e64`, verify a conversation partner `b8b1a69`, two-account integration tests and server inspection `7f33c7b`, soft-logout client rebuild `36f0443` (Phase 2 defect), live-sync readiness / invitation dates / load-older `bf05ac6`, verification-request line / history on open / offline start `588efaa`, and documentation `810615d`. **Pushed 2026-10-24**; CI run 40031270158 on `810615d` is green on all four jobs on the first run: checks, secrets-scan, dev-env (API `/ready` 200, PoC 31/31, integration 5 files / 18 tests, inspection 9/9 including "integration room holds encrypted events only", Synapse 1.163.2) and poc-e2ee.

## Current task
Owner acceptance of the Phase 3 exit gate (evidence below) and ADR-0004. No Phase 4 work has started.

## Completed (Phase 3)
Labels follow AGENTS.md §12. Unit = jsdom/Node without a network; integration = Node against the compose Synapse 1.163.1 (`pnpm test:integration`); manual = built-in browser, two origins (`localhost`, `second.localhost`) as two accounts.

| Deliverable | Status | Evidence |
|---|---|---|
| Direct-conversation model from SDK state (m.direct, `is_direct`), list with previews, unread counts, search, invitations with Accept/Decline (never auto-joined), sync-error banner | Verified | unit (model, screen); integration (invite accepted and recorded on both sides); manual |
| Start a conversation by exact identifier: local username or Matrix ID, invalid/self rejected without a request, profile lookup, display name shown as not proof of identity, existing room reused, encrypted invite-only room created | Verified | unit; integration; manual |
| Conversation view: states from SDK send state (Pending / Sent / Not sent with Retry and Delete), date separators, undecryptable and unsupported placeholders, system lines, Enter/Shift+Enter composer, drafts | Verified | unit (every `EventStatus`, retry resends the same event, delete); integration (accepted sends); manual (Sending… → Sent both ways) |
| No plaintext fallback: `sendText` refuses unless the room has an encryption state event and the backend reports encryption enabled; composer disabled otherwise; rooms created encrypted | Verified | unit; integration (unencrypted room refused, no message event stored; `fetchRoomEvent` shows `m.room.encrypted` without body); server inspection with the run's nonce (local: integration room 36 encrypted / 0 plaintext events, nonce absent from the DB file) |
| History: `scrollback` while a back token exists and the creation event is not loaded; one page auto-loaded on open when few messages are loaded; scroll kept in place | Verified | unit; integration (30 messages paged in order, no duplicates, from a fresh sync); manual (full history after reload) |
| Private read receipts (`m.read.private` only, after the conversation is open and visible) | Verified | unit (never `m.read`); integration (reader's unread count drops; sender sees no receipt) |
| Recipient security: identity verified / changed / not verified and devices from SDK state; header badges; identity-change banner; details screen with explanations and Leave | Verified | unit; integration (unverified second device still receives; late device sees an undecryptable placeholder with a historical-message code); manual (Unverified devices → Identity verified; device Verified; Leave) |
| Verify a conversation partner by in-room SAS; incoming requests as notices; request shown as a system line | Verified | unit; manual (seven identical emoji on both accounts, Identity verified on both; details updated) |
| Offline: message stays Pending while the server is unreachable and becomes Sent after reconnect, received once; reconnection and replayed transaction ids create no duplicates | Verified | integration (sync failing then resumed; replayed txnId → same event); manual (Synapse stopped and restarted) |
| Soft logout rebuilds the client on the same stores (Phase 2 defect: sync could not resume after a token refresh with crypto) | Verified | integration (fake-indexeddb stores, 10 s tokens: identity intact, sync running, encrypted send after rebuild); unit |
| Readiness waits for the first live sync; invitations dated by their membership event; offline start uses cached readiness | Verified | unit; manual (reload after setup lands on Chats; invitation list no longer crashes) |
| Integration harness: proactive token refresh for long-lived test clients under CI's 10 s lifetime; inspector `--nonce-file`; CI dev-env passes the nonce | Verified in CI | run 40031270158: integration `Test Files 5 passed (5); Tests 18 passed (18)`, inspection PASS=9 FAIL=0 |
| ADR-0004, THREAT_MODEL (TM-03, TM-04, TM-13, TM-20; soft-logout defect), ADR-0003 D4 amendment, runbook §9 | Implemented | `docs/architecture/ADR-0004-direct-messaging.md` (Status: Proposed) |

## Verification
Executed 2026-10-23 on Windows 11, Node 22, pnpm 12, TypeScript 6.0.3, Docker Desktop (Synapse 1.163.1, MongoDB 7):

- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build` — pass at the tip.
- `pnpm test` — 31 files, **278 tests pass**; 5 integration files (18 tests) skipped offline by design. One earlier full run had a single transient failure that two immediate reruns did not reproduce (not identified; noted as a flake to watch in CI).
- `HOMESERVER_URL=http://localhost:8008 ACCESS_TOKEN_LIFETIME_MS=10000 pnpm test:integration` with the local Synapse at a 10 s access-token lifetime (restored to 5 m afterwards) — 5 files, **18 tests pass** (about 47 s): Phase 2 (9) and Phase 3 (messaging 8, session soft logout 1).
- `pnpm poc` 31/31, then `pnpm poc:inspect -- --db <copy> --nonce-file apps/web/test/integration/last-run.json` — 8/8 including "integration room holds encrypted events only — 45 events, 36 m.room.encrypted, 0 m.room.message".
- Manual (runbook §9, accounts `p3-alice` on localhost and `p3-bob` on second.localhost, throwaway): start by username with display-name check; invitation accepted; messages both ways Sending… → Sent and decrypted on the other side; details show identity and device state; in-room verification with identical emoji → Identity verified on both and the device Verified; Synapse stopped: message Pending, after restart Sent and received exactly once; Leave on B → A shows "Left the conversation." and B's list is empty; reload after setup lands on Chats; history auto-loaded after reload. Not observed in the manual window: the list's sync-error banner (the long poll had not yet failed when checked; unit and integration cover the state), the mismatch path and a third device (unit and integration cover both).
- CI: run 40031270158 (`810615d`) green on all four jobs; dev-env annotations: integration 5 files / 18 tests passed, inspection 9/9, PoC 31/31, Synapse 1.163.2. https://github.com/MSabbirHossen/communication-system/actions/runs/40031270158

## Phase 3 exit gate (IMPLEMENTATION_PLAN.md)
| Criterion | Evidence |
|---|---|
| Two separate accounts can exchange encrypted messages | integration + manual |
| The recipient can decrypt messages on an authorized device | integration (first device) + manual |
| Server-side inspection confirms ordinary message content remains encrypted | `fetchRoomEvent` ciphertext (integration) + inspector with the integration nonce (local and CI run 40031270158) |
| Reconnection and synchronization do not create unintended duplicates | integration (offline catch-up, replayed txnId, pagination) + manual offline send |
| Pagination and error states work | integration (paging) + unit/screen (loading, empty, offline, sync error, failed send, not found) + manual |
| Unverified-device and undecryptable-message cases are tested | integration (unverified second device; late device undecryptable) + unit (wording per code) |
| No plaintext fallback is possible | unit (refusal, disabled composer) + integration (unencrypted room refused before any request) + inspection |

The gate is **satisfied locally and in CI**; it closes when the owner accepts the evidence and ADR-0004.

## Blockers and risks
- **R1 — Mobile E2EE on real devices untested** (ADR-0001 C2, Phase 5).
- **R5 — Toolchain pins** (TypeScript 6.0.3; pnpm `allowBuilds`).
- **R6 — Web key storage is origin-scoped IndexedDB** (TM-11); production CSP Phase 4/7.
- **R7 — Registration open on the dev homeserver only**; gating is Phase 7/8.
- **R8 — Pending (unsent) messages live in memory**: a full reload while offline loses a message that was still Pending (the SDK can persist the queue with detached pending-event ordering; deferred).
- **R9 — Recipient's unverified devices read new messages** until the user acts on the warning (owner decision, ADR-0004 D7; disclosed).
- Two direct rooms can exist with the same person after simultaneous starts; both are listed.
- A reload during the first five minutes after setup used to return to the setup screen (fixed `bf05ac6`); the SDK's sync cache is saved periodically, so other cache-age effects may surface in Phase 4 testing.

## Deferred
| Item | Reason | Risk while deferred |
|---|---|---|
| Persisted send queue across reloads | Needs the SDK's detached pending-event ordering and store support; Phase 4 | Medium (lost offline message after a reload) |
| Public read receipts, preview setting, presence, typing | Privacy settings (Phase 4/6) | Low |
| Directory search with discoverability controls | Phase 6 | Low |
| Blocking and reporting from conversation details | Phase 6 | Medium before real users |
| Media, edits, deletions, reactions, group rooms | Later releases (PRD §6.2) | n/a |
| Playwright browser end-to-end tests | Phase 4 | Low |
| Native Android/iOS projects and device spike | Phase 5 (ADR-0001 C2) | Medium |

## Decisions recorded 2026-10-23
- **Read receipts private by default** (owner): `m.read.private` only; no Read state shown (ADR-0004 D5).
- **Unverified devices receive messages, with warnings** (owner): no blocklisting (ADR-0004 D7).
- **Conversations start from an exact identifier only** (owner): no directory search until Phase 6 (ADR-0004 D3).
- **Invitations are never auto-joined** (ADR-0004 D2); **one room per pair, encrypted from creation** (D1); **states from the SDK only, no Delivered** (D4).
- **Soft logout rebuilds the client on the same stores** (ADR-0004 D11, amends ADR-0003 D4).

## Next approved action
Owner reviews the Phase 3 evidence and ADR-0004 and accepts or reopens the gate. Phase 4 (complete web experience) starts only in plan mode after acceptance.

## Last updated
2026-10-24

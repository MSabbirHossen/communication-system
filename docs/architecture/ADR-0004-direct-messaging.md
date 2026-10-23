# ADR-0004 — One-to-one encrypted messaging (web client)

**Status:** Proposed — for the project owner's approval at the Phase 3 exit gate  
**Date:** 2026-10-23  
**Deciders:** Project owner (read receipts, unverified devices and discovery decided 2026-10-23); implementation by the AI contributor  
**Inputs:** `docs/PRD.md` FR-04 to FR-07, §10; `docs/TRD.md` §6, §7, §8.4, §12.2; `docs/APP_FLOW.md` 5.3, 5.4, 5.5, §6; `docs/UI_UX_BRIEF.md` §6.4 to §6.7; `docs/IMPLEMENTATION_PLAN.md` Phase 3; ADR-0001, ADR-0003; `docs/security/THREAT_MODEL.md`.

Status labels follow AGENTS.md §12: **Implemented**, **Tested**, **Verified**, **Blocked**, **Deferred**.

---

## 1. Context

Phase 3 delivers text-only one-to-one messaging in the web client on top of the Phase 2 account and device lifecycle: finding the other person, a direct room, encrypted composition and decryption, honest delivery states, pagination and sync, unread tracking, and the warnings that keep "encrypted" from being mistaken for "verified". Every protocol operation goes through matrix-js-sdk 44 with the Rust crypto backend (ADR-0001); the client never implements cryptography and never falls back to plaintext.

Three product questions had to be decided before privacy settings exist (Phase 6): what the other side learns about reading, whether unverified devices receive messages, and how people are found.

## 2. Decisions

| # | Decision | Status |
|---|---|---|
| D1 | **One Matrix room per pair of users, created invite-only and encrypted from the first event.** `createRoom` with `is_direct`, the `trusted_private_chat` preset and `m.room.encryption` (`m.megolm.v1.aes-sha2`) in `initial_state`. The client maintains the `m.direct` account data itself (the SDK does not): on creation and when it accepts an invitation. A room counts as direct when `m.direct` lists it or its membership was flagged `is_direct`. Two concurrent creations from both sides produce two direct rooms; both are listed and no merge is attempted (documented limitation). | Verified (integration: invite accepted and recorded on both sides) |
| D2 | **Invitations are never auto-joined.** They appear in the list as an invitation with Accept and Decline; declining leaves the room. This keeps unsolicited rooms from becoming conversations without consent (TM-13). | Verified (unit, integration) |
| D3 | **Conversations start from an exact identifier only** (owner decision): a local username or full Matrix ID is resolved client-side, rejected when invalid or the user's own, and checked through the profile endpoint before starting; the display name is shown with a note that it is not proof of identity. No directory search until discoverability settings exist (Phase 6), so no user enumeration. A 404 from the profile endpoint, with either `M_NOT_FOUND` or `M_UNKNOWN`, means no such account. | Verified (unit, integration) |
| D4 | **Message states come from the SDK's send state and nothing else.** Pending while encrypting, queued or sending; Sent only once the homeserver accepted the event; Not sent on failure with Retry (the same event and transaction id are resent) and Delete. "Delivered" is not shown: Matrix has no delivery receipt for direct messages, and TRD §7.1 allows a state only when it can be substantiated. | Verified (unit for every `EventStatus`; integration for accepted sends) |
| D5 | **Read receipts are private by default** (owner decision): the client sends `m.read.private` for the latest server-accepted event once a joined conversation has been open and visible for a moment, never `m.read`. The user's own devices see unread counts drop; the other side never receives a read state until the privacy setting arrives in Phase 6. The UI therefore shows no Read state. | Verified (unit; integration: reader's unread count drops, sender sees no receipt) |
| D6 | **No plaintext fallback, enforced in one place.** `sendText` refuses, before any request, unless the room has an encryption state event and the crypto backend reports encryption enabled; the composer is disabled with an explanation for an unencrypted room, and rooms are created with encryption in their initial state so no unencrypted first event can exist (TM-04 application guard, TRD §6.3). | Verified (unit; integration: unencrypted room refused and no message event stored; CI inspection of the server database and log for the run's nonce) |
| D7 | **Unverified devices receive messages, with a warning** (owner decision): the Matrix default of encrypting to all of the recipient's published devices is kept. The conversation header shows Identity changed, Unverified devices or Identity verified from SDK state (`getUserVerificationStatus`, `getDeviceVerificationStatus`), a changed identity is also flagged above the messages, and conversation details list their devices with fingerprints. Sending is never blocked; warnings never change trust. | Verified (unit; integration: unverified second device still receives new messages) |
| D8 | **Undecryptable messages are honest placeholders** with the SDK's failure reason in plain words (waiting for the key, key withheld, sent before this device was set up, unknown sender device, …). Content is never invented or hidden. | Verified (unit per failure code; integration: a device enrolled after a send sees the placeholder with a historical-message code) |
| D9 | **History and sync use the SDK's mechanisms.** Older messages load through `scrollback` while a back-pagination token exists, keeping the messages on screen in place; the live timeline is the only source of items, so reconnecting after an outage yields each event once and retried sends do not duplicate (TM-20). Offline sending relies on the SDK queue: the message stays Pending and the SDK retries, or it becomes Not sent with Retry (APP_FLOW 5.5). | Verified (integration: offline catch-up exactly once and in order; replayed transaction id yields the same event; 30 messages paged in order without duplicates from a fresh sync) |
| D10 | **Verifying the other person uses the protocol's in-room SAS flow** (`requestVerificationDM`) through the same wrapper and screen as own-device verification; incoming requests from other users are a security notice linking into the conversation. Their identity is shown verified only when the SDK says so. | Implemented; Tested (unit); in-room SAS between two accounts is covered manually (runbook §9) and by the Phase 2 own-device SAS integration test for the shared flow code |
| D11 | **Soft logout rebuilds the client on the same stores** (amends ADR-0003 D4): the SDK's sync loop stops itself on `M_UNKNOWN_TOKEN` and cannot be restarted on the same client, and stopping the client closes the Rust crypto machine, so after a successful token refresh the old client is stopped and a new one opens the same persisted stores. Found by the Phase 3 messaging tests; the Phase 2 path had been exercised only without crypto. | Verified (integration with fake-indexeddb stores under a 10 s token lifetime: identity intact, sync running, encrypted send succeeds after the rebuild) |

## 3. What the server can see (ADR-0001 §6.2 unchanged)

Room membership and the `is_direct` flag, `m.direct` account data (which user ids you have direct rooms with), event timestamps and sizes, device keys and one-time keys, private read receipts (the server stores them to compute your unread counts; they are not shared with other users), and connection metadata. Message bodies exist only as Megolm ciphertext. The privacy notes say so.

## 4. Alternatives considered

- **Directory search for people** — rejected for now: Synapse's user directory would make every account discoverable before discoverability settings exist.
- **Public read receipts** — rejected for the beta by the owner; a setting arrives with Phase 6 privacy controls.
- **Blocking unverified devices** (`globalBlacklistUnverifiedDevices`) — rejected: in the beta most devices are unverified and messages would be unreadable; warnings plus verification keep the user informed without silent loss.
- **Auto-joining invitations** — rejected (TM-13).
- **Restarting sync on the same client after a soft logout** — not possible with the SDK (see D11).

## 5. Consequences

- The sender cannot tell whether a message was read; this is stated in the ADR and will be a per-user setting later.
- A recipient with unverified devices reads messages normally; the warning is the user's cue to verify. Identity changes are warned, not blocked.
- The conversation list previews decrypted text; a shared-device preview setting is Phase 4/6 work.
- Two rooms with the same person can exist after simultaneous starts; the list shows both.
- Resending a failed event is unit-tested through the SDK call; forcing a network failure mid-send in the Node integration harness was not practical, while protocol-level idempotency (replayed transaction id) is integration-tested.
- Pending (unsent) messages live in memory: a full reload while offline loses a message that was still Pending. The SDK can persist the queue with detached pending-event ordering; this is deferred to Phase 4 (STATUS R8).
- A conversation with fewer than ten loaded messages fetches one page of history on open, so a reload after a limited sync does not show an almost empty room.

## 6. Evidence

- Unit: `apps/web/src/matrix/{rooms,timeline,recipientSecurity}.test.ts`, `apps/web/src/screens/{Chats,NewConversation,Conversation,ConversationDetails}.test.tsx`, `session/security.test.tsx`, `session/lifecycle.test.ts`.
- Integration (Node against the compose Synapse, `pnpm test:integration`): `apps/web/test/integration/{messaging,session}.integration.test.ts`; run in the CI `dev-env` job, which also passes the run's nonce to the server inspector.
- Manual: `docs/runbooks/local-development.md` §9.

## 7. Open items

- Public read receipts and previews as privacy settings — Phase 6.
- Directory search with discoverability controls — Phase 6.
- Blocking and reporting from conversation details — Phase 6.
- Presence and typing indicators — Phase 4 with privacy settings.
- Media, edits, deletions, reactions, group rooms — later releases (PRD §6.2).

# ADR-0005 — Completing the web experience (settings, notifications, one tab, accessibility, end-to-end tests)

**Status:** **Accepted** — approved by the project owner on 2026-10-24 at the Phase 4 exit gate  
**Date:** 2026-10-24  
**Deciders:** Project owner (Matrix-native settings, localization scope, generic notifications and the cross-browser record decided 2026-10-24); implementation by the AI contributor  
**Inputs:** `docs/PRD.md` FR-08 to FR-11, §10; `docs/TRD.md` §7, §12; `docs/APP_FLOW.md` §4, 5.6 to 5.9; `docs/UI_UX_BRIEF.md` §6.8 to §6.10, §8, §9; `docs/IMPLEMENTATION_PLAN.md` Phase 4; ADR-0001, ADR-0003, ADR-0004; `docs/security/THREAT_MODEL.md`.

Status labels follow AGENTS.md §12: **Implemented**, **Tested**, **Verified**, **Blocked**, **Deferred**.

---

## 1. Context

Phase 3 delivered encrypted one-to-one messaging. Phase 4 turns the web client into a usable application: a settings area (profile, privacy and notifications, blocked users, devices), browser notifications, correct behaviour with several tabs open, verified responsive layouts and accessibility, consistent loading, empty, error and offline states, and an automated browser suite that proves the primary journeys against the production build. The application API (Phase 6) does not exist yet, so every setting has to live somewhere the client can already reach.

## 2. Decisions

| # | Decision | Status |
|---|---|---|
| D1 | **One active tab per device.** The SDK's IndexedDB stores must not be opened by two clients at once (the SDK documents this as corrupting data). The first tab takes a Web Locks lease named after the device id; a later tab shows "Already open in another tab" with **Use this tab**, which steals the lock. The losing tab stops its client without clearing any store and shows the same screen. Without the Web Locks API the client assumes a single tab. Sign-out releases the lease (TM-26). | Verified (unit: first wins, second blocked, take-over, release; e2e: two pages in one context) |
| D2 | **Settings data is Matrix-native in Phase 4** (owner decision). Display name through the Matrix profile API; blocking through the standard ignore list (`m.ignored_user_list`); the client's own settings as account data `org.cs.web.settings` (`shareReadReceipts`, `sharePresence`, `notificationPreview`) with safe parsing and defaults (receipts private, presence shared, previews generic). Settings are honoured by this client; the privacy screen says which effects the server enforces (blocking) and which it does not (the settings themselves are visible to the server). Discoverability, username claims, reports, moderation and account deletion wait for the application API (Phase 6). | Verified (unit: parsing never trusts shapes; integration: round-trips against Synapse) |
| D3 | **Public read receipts are opt-in.** Reading a conversation always sends `m.read.private`; `m.read` is sent as well only when sharing is on, and the other person's public receipt is shown as "Read by <name>" under the last own message they read. Presence follows the setting: the sync loop reports online or offline, and turning sharing off sets the status offline at once; the other person's presence is shown only when the server reports it. | Verified (integration: public receipt reaches the sender only when sharing is on; presence offline when sharing is off) |
| D4 | **Blocking is the homeserver's ignore list and is explained honestly.** Block in conversation details behind a confirmation that says their messages and invitations are no longer delivered to any device, that the conversation stays but goes quiet, and that they are not told. Unblocking says that messages sent while blocked may appear, which is what Synapse does when it re-syncs the room after an unignore. Invitations that arrived before the block are hidden client-side as well. After an unblock the homeserver re-syncs the room, so the other person's public read marker reappears only on their next read, and a message they sent while blocked may surface (it did in the integration test, whose Megolm session was shared before the block) or not (manual check: the key was shared while ignored). | Verified (integration: a blocked user's message is not delivered; delivery resumes after unblock; manual) |
| D5 | **Browser notifications carry no message content** (owner decision, TM-12). Shown only while the tab is hidden for a live incoming text message in a joined direct conversation: "New message" or, if the user chooses, "New message from <display name>"; never the body, never for the initial or cached sync, at most once per event. The browser permission is asked only from a button on the privacy screen and shown apart from the product setting. | Verified for the logic (unit with a fake Notification: text never contains the body, hidden tab only, once per event; screen test through the shell); e2e: the permission row shows the browser's state. The OS-level notification itself was not observed: headless Chromium and the built-in browser report the permission as blocked; the owner's Chrome check is in runbook §10 |
| D6 | **Sign out all other devices** uses the bulk device deletion endpoint under User-Interactive Auth with the password, with a confirmation that says what happens; the password is sent once and never kept (TM-25). | Verified (integration: other devices deleted, the current one remains; e2e: the revoked device lands on sign-in with "Your session has expired") |
| D7 | **Accessibility target: WCAG 2.2 AA for the core workflows** (TRD §12.3). Every screen the e2e suite visits runs axe with the WCAG 2.x A/AA rule tags; serious and critical findings fail the run, moderate and minor ones are recorded as attachments and annotations. Focus moves to the new screen's heading after navigation and returns to the opener when a dialog closes; the skip link is first in the tab order; `prefers-reduced-motion` disables transitions; all interactive targets meet the touch size token. | Verified (screen tests for focus; e2e axe on 20+ screens, keyboard-only journey) |
| D8 | **Localization: RTL plumbing and an exported catalogue, no machine-drafted text** (owner decision). The document `lang` and `dir` follow the locale, message bodies, previews and the composer use `dir="auto"`, dates use `Intl` for the active locale, and layout uses logical properties. `pnpm i18n:extract` writes `apps/web/i18n/en.json` for translators; the Bengali and Arabic tables stay empty until translated. The locale choice is not yet persisted across reloads. | Verified (e2e: Arabic flips `dir` to `rtl` without horizontal overflow) |
| D9 | **The end-to-end suite runs against the production build** (`pnpm build` then `vite preview`) in Chromium with the compose Synapse, locally and in the CI `dev-env` job, so "the production web build passes" is exercised, not just compiled. Two-user journeys use separate browser contexts; the one-tab journey uses two pages in one context. Traces and screenshots at four viewports (360×740, 768×1024, 1024×768, 1440×900) are uploaded as evidence. | Verified (local run; CI run recorded in STATUS) |
| D11 | **The session controller is the only token refresher** (amends ADR-0003 D4). The SDK is no longer given the refresh token: with two refreshers (SDK on 401, controller proactively) rotating the same single-use token, the pairs diverged and the device was signed out, which the first CI run of the e2e suite exposed under the 10 s token lifetime. The SDK reports an expired token as a soft logout and the controller refreshes and rebuilds (ADR-0004 D11). Across tabs the store is shared: a tab taking over the lease starts from the pair the other tab saved last, and a refresh rejected because another tab rotated the pair adopts the stored pair instead of signing out. | Verified (unit: take-over adopts the saved pair; rejected refresh adopts a rotated pair, still signs out when the store holds the same pair; e2e journey and session specs under a 10 s token lifetime locally; CI run recorded in STATUS) |
| D10 | **Cross-browser verification is recorded, not assumed** (owner decision): Chromium by the AI contributor through the e2e suite and the built-in browser; Chrome/Edge and Android Chrome by the owner against the dev server (runbook §10 record). Firefox and Safari are recorded as not verified. | Implemented (record template); owner entries pending |

## 3. States audit

Each screen handles the states below (UI brief §9); "n/a" means the state cannot occur there.

| Screen | Loading | Empty | Error | Offline |
|---|---|---|---|---|
| Welcome, Privacy notes, Terms | n/a | n/a | route error screen | static |
| Sign in / Create account | button "Working…", `aria-busy` | n/a | field errors; server, network, rate-limit, storage messages | network error message |
| Secure device setup | step list with progress | n/a | failed step with Try again / Sign out | retry |
| Chats | skeleton until the first sync | "No conversations yet" | sync-error banner with Retry now; action errors | offline banner (shell) + sync banner |
| New conversation | "Working…" | n/a | invalid / self / not found / server | network error |
| Conversation | skeleton until the first sync; "Loading…" while paging | "No messages yet" | not found; Not sent with Retry / Delete; undecryptable placeholders | Pending messages, offline banner |
| Conversation details | from SDK state | "No encryption keys are published" | action error banner | n/a |
| Devices & security | "Loading…" | n/a | error banner; UIA cancelled | n/a |
| Settings hub | n/a | n/a | n/a | n/a |
| Profile | "Working…" | n/a | validation; save error | network error |
| Privacy & notifications | switches disabled while saving | n/a | error banner | network error |
| Blocked users | from account data | "Nobody is blocked" | error banner | n/a |
| Other tab | "Working…" on take-over | n/a | n/a | n/a |
| Session error / expired | n/a | n/a | explanation with Sign in again | n/a |

## 4. What the server can see (ADR-0001 §6.2, ADR-0004 §3 unchanged)

In addition: the user's settings account data (which is not secret), the ignore list, public read receipts when the user shares them, presence when the user shares it, and the display name. Nothing in this phase sends message content anywhere new; notifications are generated on the client from already-decrypted events and never include the body.

## 5. Alternatives considered

- **Settings in the application database now** — rejected: Phase 6 owns the application API; a Mongo-backed settings store before it exists would duplicate state the client can already keep in Matrix account data (AGENTS.md §5.3).
- **BroadcastChannel election instead of Web Locks** — rejected as the primary mechanism: Web Locks are released by the browser when a tab dies, which an election protocol has to approximate with heartbeats; kept only as the documented gap (no Web Locks → single tab assumed).
- **Notification text with the sender's name by default** — rejected: generic text is the default; the sender's name is an explicit choice.
- **Machine-drafted Bengali and Arabic strings** — rejected by the owner: translators work from the exported catalogue.
- **E2E against the dev server** — rejected: the gate asks for the production build; `vite preview` serves exactly what `pnpm build` produced.

## 6. Consequences

- Only one tab per device runs the client; a user who opens the app twice is told why and can switch.
- Settings are visible to the homeserver as account data; the privacy screen says so.
- The other side can tell that the user blocked them only by inference (silence), never by notification.
- Browser notifications are useless for a user who keeps the tab in front, by design; OS-level push is Phase 5.
- Loading states before the first sync are skeletons, not "not found", so a slow start is not mistaken for a missing conversation.
- The locale choice is not persisted yet and no translated table ships; both are recorded as open items.
- The e2e suite adds about six minutes to the CI `dev-env` job and registers throwaway accounts on the compose Synapse.

## 7. Evidence

- Unit and screen: `apps/web/src/session/{tabLease,notifications,useNotifications}.test.*`, `apps/web/src/matrix/{profile,settings,blocking}.test.ts`, `apps/web/src/screens/{Settings,Profile,PrivacySettings,BlockedUsers,OtherTab}.test.tsx`, `apps/web/src/shell/focus.test.tsx`.
- Integration (`pnpm test:integration`): `apps/web/test/integration/{profile-devices,privacy,blocking}.integration.test.ts`.
- End-to-end (`pnpm test:e2e`): `apps/web/e2e/{journeys,session,accessibility}.spec.ts` with axe results, viewport screenshots and traces in `apps/web/e2e-results`; CI uploads them with the `dev-env-evidence` artifact.
- Manual: `docs/runbooks/local-development.md` §10, including the cross-browser record.

## 8. Open items

- Persist the locale choice; ship translated Bengali and Arabic tables once translators deliver them.
- Persisted send queue across reloads (STATUS R8) — Phase 7 reliability.
- HTTP-header CSP and security headers for the deployed origin (TM-11) — Phase 7.
- Push notifications and the push gateway — Phase 5.
- Discoverability, username claims, reports, moderation, account deletion — Phase 6.

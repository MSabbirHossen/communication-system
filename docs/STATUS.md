# Project Status

## Active phase
Phase 4 — Complete the web experience (**implementation complete and pushed; exit gate presented, awaiting the owner's decision and the green CI run**)

## Last completed milestone
**Phase 3 complete — exit gate accepted by the owner on 2026-10-24; ADR-0004 Accepted.** CI run 40031270158 green on `810615d`. Phase 2 closed 2026-10-23 (ADR-0003 Accepted); Phase 1 closed 2026-10-23; Phase 0 approved with conditions 2026-10-20 (ADR-0001 Accepted).

## Current task
Phase 4 exit-gate review. Implemented 2026-10-24 as the eight planned commits plus one fix on local `main` on top of `fb84247`: tab lease `b06c5d7`, settings hub / profile / sign out of other devices `deb69f1`, privacy settings `7ec2fce`, blocking `94f8082`, browser notifications `5d76f2a`, accessibility / responsive / RTL polish with the catalogue export `8318ea0`, narrow-layout and landmark fixes `d559325`, Playwright end-to-end suite `04c2ec7`, documentation `6e3d80d`. Pushed 2026-10-24 on the owner's go-ahead; CI run 40097078795 had checks, secrets-scan and poc-e2ee green and the dev-env job green through API readiness, PoC 31/31 and integration 8 files / 22 tests, but the new e2e step failed 1 of 4 (the one-tab take-over step). Root cause found and fixed in the follow-up commit (see Verification): under CI's 10 s token lifetime the SDK and the controller both rotated the single-use refresh token and the device was signed out.

## Completed (Phase 4)
Labels follow AGENTS.md §12. Unit = jsdom/Node without a network; integration = Node against the compose Synapse 1.163.x (`pnpm test:integration`); e2e = Playwright Chromium against the production build and the compose Synapse (`pnpm test:e2e`); manual = built-in browser (Chromium), accounts `p4-alice` on second.localhost and `p4-bob` on third.localhost (throwaway).

| Deliverable | Status | Evidence |
|---|---|---|
| One active tab per device: Web Locks lease, "Already open in another tab" with take-over, losing tab stops without clearing stores, release on sign-out (ADR-0005 D1, TM-26) | Verified | unit (first wins, second blocked, take-over, release); e2e (two pages, take-over both ways); manual (both directions) |
| Settings hub with Profile, Privacy & notifications, Blocked users, Devices & security, Privacy notes, theme, language, sign out | Verified | unit; e2e axe; manual |
| Profile: display name validated (1–100 chars) and saved through the Matrix profile API; identifier shown as unchangeable | Verified | unit; integration (round-trip); e2e; manual (B's list shows "Alice P4" after the change) |
| Sign out all other devices under UIA with confirmation and password; the revoked device lands on sign-in with "Your session has expired" | Verified | integration (other devices deleted, current remains); e2e (revoked device drops to sign-in) |
| Privacy settings in account data `org.cs.web.settings` with safe parsing and defaults; public read receipts opt-in ("Read by <name>"); presence follows the setting; other person's presence in details | Verified | unit (parsing never trusts shapes; receipt type by setting; read position); integration (public receipt only when sharing is on; presence offline when off); e2e (setting persists across reload); manual (B shares → A sees "Read by p4-bob"; B stops sharing presence → A's details show "Last active … ago" instead of Online) |
| Blocking through `m.ignored_user_list`: Block in details with an honest confirmation, blocked banner, Blocked users list with Unblock, invitations from blocked users hidden | Verified | unit; integration (blocked user's message not delivered; delivery resumes after unblock); e2e; manual (B's message while blocked never reached A; "after unblock" did) |
| Browser notifications: generic text only, hidden tab only, live events only, once per event, click opens the conversation; permission asked from a button and shown apart from the setting (TM-12) | Verified (logic); **Blocked (manual display)** | unit (text never contains the body; hidden/visible; off; decryption wait; dedupe); screen test through the shell with a fake Notification; e2e permission row. The built-in browser and headless Chromium report the permission as blocked, so the OS-level notification was not observed; owner to check in Chrome (runbook §10 step 4) |
| Accessibility and keyboard: focus to the new screen's heading, focus returned on dialog close, localized skip link first in tab order, reduced motion, `dir="auto"` text, locale-aware dates | Verified | screen tests (focus); e2e axe on 22 screens with no serious or critical findings (recorded moderate: none after the landmark fix); keyboard-only path; manual (RTL layout under the Arabic locale, no overflow) |
| Responsive: 360, 768, 1024, 1440 px without horizontal overflow; narrow-phone header wrap; New conversation reachable below the desktop breakpoint (defect found manually and fixed `d559325`) | Verified | e2e screenshots at four viewports; manual at 375×812 |
| States audit (loading skeletons, empty, error, offline per screen; ADR-0005 §3); last route stub removed | Implemented; screen states Tested | unit per screen; e2e |
| Localization: catalogue export `pnpm i18n:extract` → `apps/web/i18n/en.json` (325 strings); no machine-drafted Bengali/Arabic | Verified | file generated and committed; e2e RTL check |
| End-to-end suite in CI dev-env (Chromium install, run after integration, annotations, evidence upload) | Verified (step runs, annotations and artifact published); first run exposed the refresh defect | run 40097078795; fix run pending |
| ADR-0005, THREAT_MODEL (TM-11 note, TM-12 Verified for web, TM-13 ignore list, TM-25 note, new TM-26), runbook §10 with cross-browser record, this status | Implemented | `docs/architecture/ADR-0005-web-experience.md` (Status: Proposed) |

## Verification
Executed 2026-10-24 on Windows 11, Node 22.20, pnpm 12.14, TypeScript 6.0.3, Docker Desktop (Synapse 1.163.x, MongoDB 7), Playwright 1.64.1 with Chromium headless shell 156:

- `pnpm format:check`, `pnpm lint`, `pnpm typecheck` (now also `tsconfig.e2e.json`), `pnpm build` — pass at the tip.
- `pnpm --filter @cs/web test` — 36 files, **261 tests pass** (Phase 3 tip: 236).
- `pnpm test` (whole workspace, integration skipped offline by design) — 42 files pass, 8 skipped; **335 tests pass, 22 skipped**.
- `HOMESERVER_URL=http://localhost:8008 pnpm test:integration` — final run at the tip: 7 files pass, 1 skipped (the expiry file, gated on `ACCESS_TOKEN_LIFETIME_MS`); **20 tests pass, 2 skipped**, about 2 min; the Phase 4 files (`profile-devices`, `privacy`, `blocking`) are included. One full-suite run earlier in the day had the Phase 3 messaging test "warns about the recipient's unverified devices" time out while the blocking test ran in parallel; it passed on its own immediately afterwards (flake under parallel load, noted to watch in CI).
- Defect from the first CI run, reproduced locally with `refreshable_access_token_lifetime: 10s`: setup and the tab take-over ended in "Your session has expired" because the SDK (on 401) and the controller (proactively) both refreshed with the same single-use token. Fix (ADR-0005 D11): the SDK no longer receives the refresh token, a take-over starts from the pair the other tab saved last, and a refresh rejected after another tab rotated the pair adopts the stored pair. Unit: 264 web tests pass (3 new). Under the 10 s lifetime locally: `pnpm test:e2e` **4 passed** (1.9 min) and `ACCESS_TOKEN_LIFETIME_MS=10000 pnpm test:integration` **8 files, 22 tests pass** when run alone (a run started straight after the browser suite had 4 timeouts; rerun clean, recorded as load-related). Lifetime restored to 5 m afterwards.
- `pnpm test:e2e` (5 m tokens) — **4 passed** in 1.3 min against the production build and the compose Synapse (journeys 35.8 s, session 10.2 s, accessibility public 5.8 s and signed-in 24.5 s); axe: no serious or critical findings on any visited screen; artifacts in `apps/web/e2e-results`.
- Manual (runbook §10, built-in browser): settings hub; display name change seen by the other account; read receipts off by default then "Read by p4-bob" once B shared; presence "Last active … ago" after B stopped sharing; block confirmation and banner, Blocked users list, message sent while blocked not delivered, delivery after unblock; second tab blocked and take-over in both directions; Arabic locale flips the layout without overflow; 375 px phone layout without overflow (header wrap defect found and fixed); the "New conversation" dead end below the desktop breakpoint found and fixed. Not observed: an OS notification (permission blocked in the built-in browser) and a third device signing out the others (covered by the e2e suite and the integration test).
- Cross-browser record (runbook §10): Chromium by the AI contributor (e2e + built-in browser); Chrome, Edge and Android Chrome entries **pending the owner**; Firefox and Safari not verified.
- CI: run 40097078795 on `6e3d80d` — checks, secrets-scan, poc-e2ee green; dev-env failed only in the e2e step (1 of 4) as described above. The fix commit is pushed; its run is recorded here once complete.

## Phase 4 exit gate (IMPLEMENTATION_PLAN.md)
| Criterion | Evidence |
|---|---|
| Primary user journeys work from sign-in to encrypted conversation | e2e journeys spec (register → setup → start by identifier → accept → exchange → details) + manual |
| Responsive layouts remain usable at supported viewport sizes | e2e at 360/768/1024/1440 with screenshots and overflow checks + manual 375 px; owner's Android Chrome check pending |
| Session restoration and sign-out behave correctly | e2e (reload restores; sign out; revoked device → sign-in with reason) + existing unit/integration |
| Keyboard and accessibility checks pass against the project's target | axe WCAG 2.x A/AA on every visited screen (no serious/critical) + keyboard-only e2e path + focus screen tests |
| The production web build passes | e2e runs against `vite preview` of `pnpm build`; `checks` job builds |
| Manual cross-browser verification is recorded | runbook §10 record: Chromium done; Chrome/Edge/Android Chrome rows await the owner |

Gate **open**: evidence presented for the owner's decision; the cross-browser rows for the owner's browsers and a green CI run with the e2e step are outstanding.

## Blockers and risks
- **R1 — Mobile E2EE on real devices untested** (ADR-0001 C2, Phase 5).
- **R5 — Toolchain pins** (TypeScript 6.0.3; pnpm `allowBuilds`).
- **R6 — Web key storage is origin-scoped IndexedDB** (TM-11); HTTP-header CSP is Phase 7.
- **R7 — Registration open on the dev homeserver only**; gating is Phase 7/8.
- **R8 — Pending (unsent) messages live in memory** (deferred to Phase 7 reliability).
- **R9 — Recipient's unverified devices read new messages** until the user acts (ADR-0004 D7).
- **R10 — Settings are client-honoured, not server-enforced** (except blocking): another client could ignore them; the privacy screen says so (ADR-0005 D2).
- **R11 — Without the Web Locks API a single tab is assumed** (all supported browsers have it; documented gap, TM-26).
- The locale choice is not persisted across reloads; English strings under the Arabic locale show sentence punctuation on the left (expected until translated text exists).
- After an unblock the homeserver re-syncs the room: the other person's "Read by" marker reappears on their next read, and a message they sent while blocked may or may not surface (integration: it did; manual: it did not, its key having been shared while ignored).
- Integration tests time out when run straight after the browser suite on the same Synapse (seen twice today; clean when run alone). CI runs them before the e2e step.

## Deferred
| Item | Reason | Risk while deferred |
|---|---|---|
| Persist the locale choice; translated Bengali/Arabic tables | Translators work from `apps/web/i18n/en.json` (owner decision) | Low |
| Persisted send queue across reloads | Phase 7 reliability | Medium (lost offline message after a reload) |
| Avatar upload and media | Later releases (PRD §6.2) | n/a |
| Discoverability, username claims, reports, moderation, account deletion | Phase 6 (application API) | Medium before real users |
| Push notifications and push gateway | Phase 5 | Low |
| HTTP-header CSP and security headers | Phase 7 | Medium (TM-11) |
| Firefox and Safari verification | No access | Low |
| Native Android/iOS projects and device spike | Phase 5 (ADR-0001 C2) | Medium |

## Decisions recorded 2026-10-24
- **Settings data Matrix-native in Phase 4** (owner): profile API, ignore list, `org.cs.web.settings` account data (ADR-0005 D2).
- **Localization: RTL plumbing and catalogue export, no machine-drafted text** (owner) (ADR-0005 D8).
- **Browser notifications: generic text only, behind a setting** (owner) (ADR-0005 D5).
- **Cross-browser record: Chrome/Edge and Android Chrome by the owner, Chromium by the AI contributor** (owner) (ADR-0005 D10).
- **One active tab per device** (ADR-0005 D1); **public read receipts opt-in** (D3); **blocking is the homeserver's ignore list, explained honestly** (D4); **WCAG 2.2 AA target with axe gating** (D7); **e2e against the production build** (D9).

## Next approved action
Owner review of the Phase 4 exit gate once the CI run of the fix is green: record the Chrome/Edge and Android Chrome checks in runbook §10 and decide on ADR-0005. No Phase 5 work starts before the gate closes.

## Last updated
2026-10-24

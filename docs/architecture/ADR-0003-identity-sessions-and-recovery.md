# ADR-0003 — Identity, sessions, device security and recovery (web client)

**Status:** **Accepted** — approved by the project owner on 2026-10-23 at the Phase 2 exit gate  
**Date:** 2026-10-23  
**Deciders:** Project owner (recovery model and multi-device decided 2026-10-23); implementation by the AI contributor  
**Inputs:** `docs/PRD.md` §10.4; `docs/TRD.md` §4.1, §5.3; `docs/APP_FLOW.md` 5.1, 5.2, 5.4; `docs/UI_UX_BRIEF.md` §6.2, §6.3, §6.8; `docs/IMPLEMENTATION_PLAN.md` Phase 2; ADR-0001 (Matrix, matrix-js-sdk 44 with the Rust crypto backend); `docs/security/THREAT_MODEL.md`.

Status labels follow AGENTS.md §12: **Implemented**, **Tested**, **Verified**, **Blocked**, **Deferred**.

---

## 1. Context

Phase 2 gives the web client a secure account and device lifecycle: registration and sign-in, encryption initialisation on every device, device verification with honest state, session persistence and sign-out, device listing and revocation, expired-session handling and a defined recovery behaviour. All protocol operations go through matrix-js-sdk (ADR-0001 C4); nothing here implements cryptography.

Three questions needed decisions that the requirements leave open: where a browser keeps the session and keys, how access tokens are refreshed when the SDK does not do it for native Matrix sessions, and what "recovery" means when the server cannot read message history.

## 2. Decisions

| # | Decision | Status |
|---|---|---|
| D1 | **Authentication is Matrix-native password registration and login.** Registration completes the User-Interactive Auth flow only when the homeserver offers a flow consisting solely of `m.login.dummy`; any other required stage (email, token, CAPTCHA) is reported as unsupported, never bypassed. A wrong password and an unknown user produce the same message, so account existence is not revealed. | Verified (integration tests against Synapse 1.163.1; manual) |
| D2 | **Web session storage is an app-owned IndexedDB database** (`cs-session`: user id, device id, access and refresh tokens, expiry), never `localStorage`. The SDK's sync store (`matrix-js-sdk:cs-sync-<device>`) and the Rust crypto store (`cs-crypto-<device>::matrix-sdk-crypto`) are also IndexedDB, namespaced per device so two sessions in one profile never share a database. If IndexedDB is unavailable (private mode, blocked storage) the app shows a clear error; there is no in-memory fallback that would silently lose keys. Limitation: everything is readable by script running in the origin (THREAT_MODEL TM-11); the Content Security Policy is the control, and the limitation is disclosed in the privacy notes. | Verified (unit tests with fake-indexeddb; manual) |
| D3 | **Token model: refresh tokens with short-lived access tokens, refreshed by the app.** Login and registration request a refresh token; the dev Synapse issues 5-minute access tokens and 30-day refresh tokens. matrix-js-sdk 44 refreshes tokens on its own only for OAuth 2.0 sessions, so the session controller drives native `/refresh`: proactively 60 s before expiry, before use when a stored token is about to expire, on soft logout (refresh, then restart sync), with a 30 s retry on network failure. A refresh the server rejects (`M_FORBIDDEN`, `M_UNKNOWN_TOKEN`) ends the session. Synapse keeps the previous access token valid until its own expiry; refresh tokens are single-use. | Verified (integration: expiry → soft logout → refresh restores access at a 10 s lifetime in CI; replay of a used refresh token rejected; unit tests with fake timers) |
| D4 | **Soft logout keeps the device; hard logout wipes it.** `soft_logout: true` from the server keeps every store and refreshes the token. Hard logout (device deleted on the server, token unknown without `soft_logout`, refresh rejected, or the user signing out) deletes the session store, the sync store and this device's crypto store (the SDK must be told the per-device prefix, otherwise it deletes the default store and leaves the keys behind) and routes to sign-in with "Your session has expired". Revocation stops future access; it cannot erase content a device already downloaded (TRD §5.3), which the revocation dialog says. *Amended 2026-10-23 (ADR-0004 D11):* after a soft logout the client is rebuilt on the same persisted stores rather than restarting sync, because the SDK's sync loop cannot be restarted on the same client and stopping the client closes the crypto machine. | Verified (integration: revoked client observes a hard logout and its token is rejected; manual: revoked tab lands on sign-in and only the empty session database remains) |
| D5 | **Secure device setup runs before the app is usable.** First device: cross-signing (password re-authentication when the server requires it), secret storage protected by a generated recovery key, server-side encrypted key backup. Additional device: enter the recovery key (checked against the stored key description, five attempts) to restore the cross-signing secrets and backup access, or skip and stay unverified until verified from another device. A device that skipped returns to the setup screen on every start until it is verified or restored. The chat composer is never shown before the session is ready (APP_FLOW 5.1). | Verified (integration: created / restored with a wrong key first / skipped; manual) |
| D6 | **Recovery model: recovery key plus key backup; no account-password recovery in the beta.** The recovery key is generated client-side, shown once with copy and download, acknowledged by the user, never persisted by the app and cleared from memory after setup. Losing the key and every device means the encrypted history is gone; the setup screen and the sign-in recovery note say so (PRD §10.4, TM-16, TM-24). Account identity recovery (password reset) is a Phase 7/8 decision. | Implemented; Verified for restore |
| D7 | **Multi-device at launch; "Verified" means what the SDK says.** A device is shown Verified only when `getDeviceVerificationStatus` reports it verified (cross-signing); otherwise Not verified, Unknown or No encryption keys. Own-device verification uses the protocol's SAS method (`m.sas.v1`) with seven emoji compared on both devices and explicit "They match" / "They don't match" actions; a mismatch cancels with `m.mismatched_sas`, a cancel keeps the warning, leaving the screen mid-flow cancels the request. Verification of other users' devices is wired in the service layer and surfaces in Phase 3. | Verified (integration: two Node clients complete SAS, device becomes verified; mismatch leaves it unverified; manual: two browser origins) |
| D8 | **Sensitive operations re-authenticate with the password (UIA).** Device deletion and cross-signing key upload prompt for the password when the server demands it; the password is sent once, never stored, and cancelling the prompt leaves the device in place without an error (TM-25). | Verified (integration; manual) |
| D9 | **Security notices are informational and never change trust.** The signed-in session surfaces: a device added to the account after sign-in, the account's master cross-signing key being replaced (compared against a snapshot so trust changes do not raise false alarms), key backup turned off, and an incoming verification request from one of the user's own devices (TM-03, TM-08). Each links to the device list or the verification screen and can be dismissed or declined. | Verified (unit; manual: new-device notice and verification request seen on the other origin) |

## 3. Alternatives considered

- **`localStorage` for the session** — rejected: synchronous, string-only, equally script-accessible and more often cleared by privacy tooling; IndexedDB also matches where the SDK keeps its own data.
- **Letting the SDK refresh tokens** — not available: matrix-js-sdk 44 refreshes only OAuth 2.0 sessions; native refresh (MSC2918) must be app-driven. Revisit if the homeserver moves to OAuth 2.0 / MAS.
- **Passphrase-protected secret storage** — deferred: a passphrase is easier to remember but weaker and tempting to reuse; the recovery key is the beta's single, explicit recovery secret. Can be added later without changing the model.
- **Treating a successful login as trust** — rejected by requirement (IMPLEMENTATION_PLAN Phase 2 security requirements); an additional device stays Not verified until restored or verified.
- **Sign out everywhere** — deferred to Phase 4 (settings); device-by-device revocation covers the security need now.

## 4. Consequences

- A stolen access token is useful for at most five minutes; a stolen refresh token until it is used, replaced or the device is revoked (TM-06).
- Users must keep the recovery key; support cannot recover history (disclosed). New devices without the key must be verified from an existing device.
- Every protected server operation may interrupt the user with a password prompt; this is intentional (TM-25).
- Web keys live in the browser's origin storage; production hardening (strict CSP, headers) is Phase 4/7 work and the limitation stays in the privacy disclosure. The same question for Capacitor WebViews is the Phase 5 device spike (ADR-0001 C2, TM-23).
- The dev homeserver configuration gained refresh-token lifetimes; CI shortens the access-token lifetime to 10 seconds to exercise expiry. Existing local setups generated before this change use Synapse's defaults, which are the same 5-minute refreshable lifetime.

## 5. Evidence

- Unit: `apps/web/src/**/*.test.{ts,tsx}` (session store, client factory, auth error mapping, UIA, crypto setup state machine, devices, verification flow, security events, controller and lifecycle with fake timers, screens).
- Integration (Node against the compose Synapse, `pnpm test:integration`): `apps/web/test/integration/*.integration.test.ts`; run in the CI `dev-env` job.
- Manual: `docs/runbooks/local-development.md` §8 (two browser origins).
- Security finding during the manual check, fixed before the gate: the crypto store survived a hard logout because the SDK was not told the per-device prefix (commit `fix(session): delete the device's crypto store on hard logout`).

## 6. Open items

- Registration abuse controls for real users (registration token or invite, email verification) — Phase 7/8 (TM-13).
- MFA evaluation — Phase 7 (TM-08).
- Production CSP and security headers — Phases 4 and 7 (TM-11).
- Other users' device verification in the UI and room-level "block unverified devices" — Phase 3 (TM-03).

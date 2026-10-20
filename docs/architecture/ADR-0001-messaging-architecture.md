# ADR-0001 — Messaging architecture: Matrix versus a custom backend

**Status:** **Accepted with conditions** — approved by the project owner on 2026-10-20 (Phase 0 exit gate); conditions in §6  
**Date:** 2026-10-20  
**Deciders:** Project owner  
**Inputs:** `docs/PRD.md` §12, §17; `docs/TRD.md` §2, §4, §6, §19; `docs/IMPLEMENTATION_PLAN.md` Phase 0; `docs/BACKEND_SCHEMA.md`; Phase 0 proof of concept in `poc/matrix-e2ee/` (`RESULTS.md`, `evidence/`).

Status labels used below follow AGENTS.md §12: **Implemented**, **Tested**, **Verified**, **Blocked**, **Deferred**.

---

## 1. Context

The product requires end-to-end encrypted (E2EE) one-to-one messaging on web, Android and iOS from the first public beta, built by a very small team, with no custom cryptography and no silent plaintext fallback (TRD §2.2, §6.1; AGENTS.md §6).

TRD §2.2 requires an explicit comparison of two options before full implementation:

- **Option A — Matrix:** a Matrix homeserver plus the official client SDKs, with E2EE provided by the protocol (Olm/Megolm via the Rust `matrix-sdk-crypto` crate).
- **Option B — Custom backend:** Node.js/Express/MongoDB with Socket.IO transport, plus an established E2EE protocol library integrated by this project.

The comparison must cover security, licensing, web/mobile compatibility, development effort, hosting, maintenance, interoperability, data control and future scaling. A custom backend must not be chosen merely because it is more familiar (TRD §2.2).

## 2. Decision

**Adopt Option A, Matrix, as the messaging source of truth**, subject to the conditions in §6.

| Concern | Decision | Status |
|---|---|---|
| Protocol | Matrix Client-Server API; rooms, membership, device keys, E2EE, sync and receipts are owned by Matrix | Verified for E2EE DM flow (PoC) |
| Homeserver | **Synapse** (element-hq/synapse, AGPL-3.0), self-hosted on Linux with PostgreSQL. Continuwuity (Apache-2.0, Rust) is the recorded fallback | Decided; current Synapse not yet run locally (see §4.2) |
| Web SDK | `matrix-js-sdk` 44.0.0 with the Rust crypto backend `@matrix-org/matrix-sdk-crypto-wasm` 18.9.0, both Apache-2.0, neither deprecated on npm | Verified (Node; same code path as browser) |
| Mobile SDK | **Proposed: Capacitor wrapper around the web client** (same matrix-js-sdk + wasm crypto); React Native dropped — see §5, `MOBILE_SPIKE.md` and condition C2 | Researched; on-device behaviour untested (Blocked locally) |
| Application API | Node.js/TypeScript/Express + MongoDB for app-owned data only, exactly as in `docs/BACKEND_SCHEMA.md`. No message, room, membership or crypto state in MongoDB | Decided |
| Federation | Disabled for the beta (closed server), per TRD §4.3 and threat model TM-18 | Decided |
| Authentication | Matrix-native password registration/login for the beta; registration gated by token or invite. Firebase Auth is **not** used for the messaging identity (resolves PRD §17.2) | Decided |
| Push | Synapse push rules → sygnal (or compatible) → FCM/APNs with `event_id_only` payloads | Decided, Deferred to Phase 5 |

## 3. Options considered

### Option A — Matrix (homeserver + official SDKs)

**How it works.** Clients register devices with the homeserver and publish public identity and one-time keys. A direct message is a two-member encrypted room. Message bodies are encrypted on the sender's device with Megolm; the session key is distributed to each recipient device over Olm. The server stores and routes only `m.room.encrypted` events. Cross-signing lets a user vouch for their own devices; SAS/QR verification lets users verify each other.

**Security.** The crypto implementation is `matrix-sdk-crypto` (Rust), shared by Element Web, Element X and all current official SDKs. The server has no decryption capability. The PoC verified TRD §6.5 items (1)–(3) directly: the server database holds ciphertext only, authorized devices decrypt, a device without the key cannot (`HISTORICAL_MESSAGE_NO_KEY_BACKUP`), and a client without a crypto backend is refused rather than falling back to plaintext. Residual risks (metadata, rogue devices, web key storage) are in `docs/security/THREAT_MODEL.md`.

**Licensing.**
- Synapse and Dendrite: AGPL-3.0 since v1.99 (Element, December 2023). Unmodified self-hosting carries no source-publication obligation; modifying Synapse does. The project's clients and API are separate programs over the published HTTP API. Commercial licence available from Element.
- Client SDKs (`matrix-js-sdk`, `matrix-rust-sdk`, crypto wasm): Apache-2.0 (Element's September 2024 licensing post; npm metadata checked 2026-10-20).
- Continuwuity / Conduit / Tuwunel: Apache-2.0.

**Web/mobile compatibility.** Web: verified in Node with the same SDK and crypto package a browser bundle uses; browsers add IndexedDB persistence. Mobile: see §5 — the JS SDK is not documented for React Native and the Rust SDK ships Kotlin/Swift bindings; untested here.

**Development effort.** Low for messaging. The PoC (~400 lines, one day) covered registration, encrypted send/receive to two devices, network interruption, idempotent retry, late-device key isolation, logout and two forced encryption failures without writing any crypto.

**Hosting and operations.** Synapse needs Linux, PostgreSQL, a TLS reverse proxy and routine upgrades. **No maintained homeserver publishes a native Windows build** (Synapse docs: not officially supported; Continuwuity v26.9.1 and Tuwunel v1.9.4 release assets are Linux-only). Windows development requires Docker Desktop or WSL2.

**Interoperability and lock-in.** Open specification, several server implementations, standard client API, so switching homeserver (Synapse ↔ Continuwuity) is feasible.

**Data control.** Self-hosted. Server holds ciphertext and metadata; retention is under project control. Account deletion maps to the Matrix deactivate API plus the application workflow.

**Future scaling.** Workers and PostgreSQL scale Synapse well beyond beta needs. Groups, encrypted media, calls and multi-device are existing protocol features, so later PRD releases do not require re-architecture.

### Option B — Custom backend with an established E2EE library

**How it would work.** Node.js/Express API, MongoDB for users, conversations and encrypted envelopes, Socket.IO for realtime, client-side Double Ratchet via a library, with the project implementing key distribution (prekeys), session establishment, multi-device fan-out, key-change handling, cursor sync, idempotency, receipts and push.

**Security.** Primitives would be established, but the *protocol integration* would be project-written, security-critical, unreviewed code by a solo developer — the risk TRD §2.2 and AGENTS.md §6 forbid. `libsignal` is AGPL-3.0 and its maintainers explicitly do not support third-party use.

**Licensing.** Mixed; the leading library is AGPL with a "not for third parties" stance.

**Web/mobile compatibility.** Separate native bindings per platform, with the project guaranteeing wire compatibility.

**Development effort.** High: everything Matrix provides must be designed, built and tested. The PRD's 16–24 week estimate would not hold.

**Hosting and operations.** Simpler stack (Node + MongoDB) and Windows-friendly local development — the one clear advantage.

**Interoperability, data control, scaling.** No interop; each future feature (groups, media, calls) is new protocol design.

### Summary matrix

| Criterion (TRD §2.2) | A — Matrix | B — Custom |
|---|---|---|
| Security | Audited protocol, shared Rust crypto, verified in PoC; no project crypto code | Established primitives, project-written protocol integration |
| Licensing | Server AGPL (unmodified use fine); SDKs Apache-2.0 | Library-dependent; leading option AGPL, no third-party support |
| Web compatibility | Verified | Feasible |
| Mobile compatibility | Rust SDK bindings exist (Kotlin/Swift); RN path unproven (C2) | Feasible, project-owned |
| Development effort | Low–medium | High |
| Hosting | Linux + PostgreSQL; Docker/WSL2 for Windows dev | Node + MongoDB anywhere |
| Maintenance | Upstream (Element, Matrix Foundation) | Entirely on the project |
| Interoperability | Open standard | None |
| Future scaling | Already specified features | Each a new security design |

## 4. Phase 0 proof-of-concept evidence

### 4.1 Results

Full output and the stored-event dump are in `poc/matrix-e2ee/RESULTS.md` and `evidence/`. Two recorded local runs: `c53fc0cd` and `77a2f5ca` (wiped database), 31/31 client checks and 8/8 server-inspection checks each; plus two CI runs against Synapse 1.163.0 with the same result (§4.2).

| IMPLEMENTATION_PLAN §8 item | Status | Evidence |
|---|---|---|
| 1. Two accounts sign in | Verified | registration + password login, Bob on two devices |
| 2. Device identity established and verified | Verified | ed25519 fingerprints; unverified → verified by fingerprint |
| 3. Encrypted DM sent | Verified | wire type `m.room.encrypted`, megolm, no body |
| 4. Recipient decrypts (two devices) | Verified | exact plaintext returned on both devices |
| 5. Server stores ciphertext only | Verified (Synapse 1.67.0 locally **and** 1.163.0 in CI) | direct SQLite read: 0 `m.room.message`, nonce absent from DB file and log |
| 6. Recovery from network interruption, no duplicates | Verified | `SYNCING → RECONNECTING → SYNCING`; exactly one copy; txnId replay returns same event_id |
| 7a. Web SDK viable | Verified (Node) | same SDK/crypto packages as browser |
| 7b. Mobile SDK viable | **Blocked — not tested** | §5 |
| Extra: no plaintext fallback | Verified | crypto-less client refused; encryption error → `not_sent`; server count unchanged |
| Extra: late device cannot read history | Verified | `HISTORICAL_MESSAGE_NO_KEY_BACKUP` |
| Extra: logout revokes token | Verified | `M_UNKNOWN_TOKEN` |

### 4.2 Homeserver route used, and why

Attempted in this order on 2026-10-20:

1. `pip install matrix-synapse` (current) — **failed**: no Windows wheel for Synapse ≥ 1.68 (Rust extension), no `cargo` on the machine, and the PyPI download stalled at ~15 kB/s.
2. Docker — **unavailable** (not installed). WSL2 — **unavailable** (not installed; installing either needs an elevated shell and a reboot, which this session cannot do).
3. **Used: Synapse 1.67.0**, the last pure-Python release (Sept 2022), on Python 3.13 with dependency pins and three Windows shims, documented in `poc/matrix-e2ee/README.md`.

Consequence: the PoC proves client-SDK and protocol properties, not the operation of a current Synapse. `.github/workflows/ci.yml` re-runs the identical PoC against `matrixdotorg/synapse:latest` in Docker; it has not executed yet because the repository has no commits on the remote. Phase 1 must provide a Docker/WSL2 dev homeserver.

**Re-check on 2026-10-20 (later the same day), requested by the owner:** a local re-run in Docker is still **Blocked** (no `docker` binary, no Docker process, no Docker Desktop package, WSL "not installed", no podman/nerdctl). The repository was then committed and pushed with the owner's authorization, and the CI job ran the identical PoC against the official image `ghcr.io/element-hq/synapse:latest` (digest `sha256:97665cd4…`, **Synapse 1.163.0**): **31/31 PoC checks and 8/8 server-inspection checks passed** in runs [39491618424](https://github.com/MSabbirHossen/communication-system/actions/runs/39491618424) and [39492012245](https://github.com/MSabbirHossen/communication-system/actions/runs/39492012245). Results are published as public check annotations (see `poc/matrix-e2ee/RESULTS.md` §8). The Phase 0 evidence therefore no longer depends on Synapse 1.67.0 or the Windows shims; condition **C6 is satisfied**.

### 4.3 Crypto library status (Verified against official sources on 2026-10-20)

- The PoC's encryption comes from `@matrix-org/matrix-sdk-crypto-wasm` 18.9.0 (WebAssembly build of Rust `matrix-sdk-crypto`), loaded by `matrix-js-sdk` 44.0.0 `initRustCrypto()`.
- matrix-js-sdk README: E2EE "is based on the WebAssembly bindings of the Rust matrix-sdk-crypto library"; the encryption guide: it "is the only supported backend for new integrations", and the legacy `MatrixClient.crypto` is "no longer available".
- `npm view` reports no deprecation for either package; `@matrix-org/olm` (legacy libolm) is not a dependency.
- **Not deprecated.** The deprecated path (libolm / `initLegacyCrypto`) is not used.

## 5. Mobile SDK assessment (Blocked — researched, not tested)

Findings from official sources, fetched 2026-10-20:

| Source | Finding |
|---|---|
| matrix-js-sdk README | Supported hosts: Node.js and browsers (via a bundler). Deno "not officially supported". React Native not mentioned |
| matrix-sdk-crypto-wasm README | Entry points for "web-like" (fetch) and "Node.js-like" (fs) environments; no React Native or Hermes mention |
| matrix-js-sdk issue #4147 (Apr 2024) | `initRustCrypto()` on React Native/Expo (Hermes) failed with "Property 'FinalizationRegistry' doesn't exist"; closed by the author without a documented fix; no maintainer statement |
| matrix-rust-sdk `bindings/` | `apple`, `matrix-sdk-ffi`, `matrix-sdk-ffi-macros`, `matrix-sdk-crypto-ffi` (UniFFI → Kotlin/Swift). No React Native binding |
| React Native 0.84 release post (Feb 2026) | Hermes V1 is the default engine; the post does not mention WebAssembly. Third-party coverage claims WebAssembly support in Hermes V1 — **unverified** |
| linagora/react-native-matrix-crypto | Community bridge of `matrix-sdk-crypto` to RN via UniFFI/JSI; crypto layer only; maintenance status unknown |

**Spike update (2026-10-20, `MOBILE_SPIKE.md`).** Further official sources settle the React Native question for now:

- Hermes WebAssembly support exists but is "an early preview … not yet ready for production use", exercised with an internal test flag from a from-source build (Hermes maintainer post, 17 Feb 2026); the React Native 0.84 release post, the Hermes docs page and the Expo SDK 55 changelog do not mention WebAssembly.
- Current Hermes does now support `FinalizationRegistry` (stable release note 260318099.0.0), so the 2024 failure mode is gone, but the wasm package still has no React Native entry point and Metro cannot bundle its browser loader.
- The on-device React Native test could **not** be executed on this machine (no JDK, Android SDK or emulator; emulator acceleration needs an elevated shell). It remains **untested**.

**Conclusion and proposal.** React Native + matrix-js-sdk is not viable for a product today. Of the alternatives compared in `MOBILE_SPIKE.md` §4 (native bridge to matrix-rust-sdk, native Kotlin/Swift apps, Capacitor wrapper, web-first with mobile deferred), the ADR proposes the **Capacitor wrapper around the web client**: it ships the exact crypto stack verified in Phase 0, fits a solo developer's budget, and its push-cannot-decrypt limitation already matches PRD FR-09. Its WebView-resident key storage is the same posture as the web client (threat model TM-11, TM-23) and must be disclosed. Native Kotlin/Swift on matrix-rust-sdk stays the upgrade path. This replaces the PRD §12 mobile preference and needs owner approval. Recorded as **open risk R1** in `docs/STATUS.md` until the Phase 5 device spike passes.

## 6. Conditions on this decision

- **C1 — Owner approval.** Granted 2026-10-20 with the conditions below; the ADR is Accepted.
- **C2 — Mobile is a Capacitor wrapper, provisionally.** The mobile apps wrap the web client with Capacitor (MOBILE_SPIKE.md option D). This is provisional until the Phase 5 spike passes on **real devices**, Android (System WebView) and iOS (WKWebView), covering at minimum: wasm crypto (`initRustCrypto()`, encrypt and decrypt against the project homeserver), key storage (persistent crypto store across app restart; recovery key and session token in native secure storage), and session restore (app restart, background/foreground, sign-in survives). **Fallback if the spike fails:** native Kotlin and Swift apps on matrix-rust-sdk (option C). The Matrix decision stands either way.
- **C2a — Privacy disclosure.** The WebView key-storage limitation (keys live in the WebView's IndexedDB inside the app sandbox, without hardware-backed key protection; threat model TM-23) must appear in the user-facing privacy disclosure before any mobile beta.
- **C3 — Threat model maintained.** `docs/security/THREAT_MODEL.md` is updated whenever the SDK, server, storage or recovery design changes.
- **C4 — No duplicate messaging state.** MongoDB collections are limited to `docs/BACKEND_SCHEMA.md`; any new collection touching messaging requires a new ADR.
- **C5 — Server licence review.** If the project ever modifies Synapse, review AGPL implications first; Continuwuity is the Apache-2.0 fallback.
- **C6 — Current-Synapse verification.** The CI PoC job against current Synapse must pass before Phase 2 relies on any server behaviour. **Satisfied 2026-10-20** (Synapse 1.163.0, runs 39491618424 and 39492012245).

## 7. Consequences

1. The project writes no cryptographic or protocol code; Phases 2–3 integrate SDK features and build UX.
2. Direct messages are two-member encrypted Matrix rooms marked `is_direct`; conversation lists derive from `m.direct` account data and room state.
3. Identity is the Matrix user ID; `username_claims` only if product rules exceed what the homeserver enforces (TRD §19.4 remains open).
4. Local development on Windows needs Docker Desktop or WSL2. Phase 1 provides a `docker compose` homeserver; the pip/shim route used here is not supported.
5. React Native leaves the proposed stack; mobile is a Capacitor wrapper of the web client, conditional on the C2 device spike. Phase 5's estimate shrinks if the spike passes and grows (native apps) if it fails.
6. Server is AGPL (§3, C5); no obligation for unmodified self-hosting.
7. Operational ownership (PostgreSQL, upgrades, backups, push gateway) is an open decision (TRD §19.14).

## 8. Open decisions resolved or narrowed by this ADR

| TRD §19 decision | Outcome |
|---|---|
| 1 Messaging architecture | Matrix (this ADR) |
| 2 Client SDKs | Web and mobile: matrix-js-sdk 44 + crypto wasm 18.9 (mobile via Capacitor wrapper, pending C2) |
| 3 Homeserver | Synapse, self-hosted Linux + PostgreSQL; Continuwuity fallback |
| 4 Account identity | Matrix user ID; `username_claims` only if needed |
| 9 Federation | Disabled for beta |
| 10 Notifications | Synapse push → sygnal → FCM/APNs, `event_id_only` |
| 5, 6, 7, 8, 11, 12, 13, 14 | Still open; owners and targets in THREAT_MODEL.md §7 and STATUS.md |

## 9. References

- Element, "A new home and license (AGPL) for Synapse and friends", Dec 2023 — https://element.io/blog/element-to-adopt-agplv3/
- Element, "Sustainable licensing at Element with AGPL", Sep 2024 — https://element.io/blog/sustainable-licensing-at-element-with-agpl
- Synapse installation docs (Windows not officially supported; Python 3.10–3.13) — https://element-hq.github.io/synapse/latest/setup/installation.html
- matrix-js-sdk README — https://github.com/matrix-org/matrix-js-sdk/blob/develop/README.md
- matrix-js-sdk encryption guide — https://matrix-org-matrix-js-sdk.mintlify.app/guides/encryption-overview
- matrix-js-sdk issue #4147 (Hermes `FinalizationRegistry`) — https://github.com/matrix-org/matrix-js-sdk/issues/4147
- matrix-sdk-crypto-wasm README — https://github.com/matrix-org/matrix-sdk-crypto-wasm/blob/main/README.md
- matrix-rust-sdk bindings — https://github.com/matrix-org/matrix-rust-sdk/tree/main/bindings
- React Native 0.84 release post — https://reactnative.dev/blog/2026/02/11/react-native-0.84
- Continuwuity releases (Linux-only assets, v26.9.1) — https://forgejo.ellis.link/continuwuation/continuwuity/releases
- Tuwunel releases (Linux-only assets, v1.9.4) — https://github.com/matrix-construct/tuwunel/releases
- linagora/react-native-matrix-crypto — https://github.com/linagora/react-native-matrix-crypto

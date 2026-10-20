# Phase 0 PoC — Results

**Date:** 2026-10-20  
**Machine:** Windows 11 (non-elevated shell), Node 22.20.0, pnpm 12.9.1, Python 3.13.7  
**Client stack:** matrix-js-sdk 44.0.0, @matrix-org/matrix-sdk-crypto-wasm 18.9.0 (both Apache-2.0)  
**Homeserver:** Synapse 1.67.0 via pip with Windows shims (see README — not the supported route)  
**Recorded runs:** `c53fc0cd` (first full pass) and `77a2f5ca` (re-run from a wiped database). Filtered output in `evidence/`.

Status labels per AGENTS.md §12. "Verified" means the check executed and passed in both recorded runs.

## 1. Summary against IMPLEMENTATION_PLAN §8

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 1 | Two separate Matrix accounts can sign in | Verified | `@poc-alice-77a2f5ca:localhost`, `@poc-bob-77a2f5ca:localhost`; Bob on two devices up front, a third later |
| 2 | A client can establish and verify device identity | Verified | Each client prints its ed25519 fingerprint; Alice sees Bob's devices as unverified, marks them verified, status flips |
| 3 | One client sends an encrypted direct message | Verified | Sender's wire event is `m.room.encrypted`, `algorithm=m.megolm.v1.aes-sha2`, no `body`, plaintext nonce absent from wire content |
| 4 | The recipient decrypts it successfully | Verified | Both of Bob's devices return the exact plaintext via `getClearContent()`; event flagged encrypted with sender `@poc-alice…` |
| 5 | Homeserver stores the encrypted event without plaintext | Verified | Direct SQLite read: 4 `m.room.encrypted`, 0 `m.room.message`; nonce absent from the whole 1.7 MiB DB file and 110 KiB log; see §3 |
| 6 | Clients recover from a network interruption | Verified | Bob's laptop: `SYNCING → RECONNECTING → SYNCING`; message sent during the outage arrives exactly once after recovery; earlier message still readable |
| 7 | Web and mobile SDK choices are viable | **Web: Verified in Node (same code path as browser). Mobile: Blocked — not tested** | ADR-0001 §5 |

## 2. Check-by-check output (run 77a2f5ca, clean database)

```
1. Registering accounts and devices
PASS  two accounts registered  — @poc-alice-77a2f5ca:localhost, @poc-bob-77a2f5ca:localhost
PASS  second device signed in for Bob
2. Creating an encrypted direct room
PASS  room is encrypted on Alice's side  — !QaUrYCLMZYvuElHQmL:localhost
3. Device identity and verification
PASS  Alice sees both of Bob's devices  — GDBLWYREMZ, RRVNBJWSTA
PASS  Bob's device starts unverified
PASS  Alice marked Bob's device verified
4. Sending and decrypting an encrypted message
PASS  sender's wire event type is m.room.encrypted  — $qw0FmnDrdRtwRTsdCIa0kL65RIRISqrJ2nqUFQEFgjk
PASS  wire content has ciphertext and no body  — algorithm=m.megolm.v1.aes-sha2
PASS  wire content does not contain the plaintext
PASS  Bob device 1 decrypted message 1
PASS  Bob device 2 decrypted message 1
PASS  decrypted event is flagged encrypted and verified sender
5. Network interruption: Bob's laptop loses connectivity, Alice sends, laptop reconnects
PASS  client reports connection loss (sync state ERROR/RECONNECTING)  — state=RECONNECTING failedRequests=1
PASS  offline device has not seen message 2 yet  — offline for 3s, failed requests so far=1
PASS  reconnected device received message 2 exactly once  — count=1
PASS  device 1 also has message 2 exactly once
PASS  sync state recovered to SYNCING after the outage  — transitions: SYNCING → RECONNECTING → SYNCING
PASS  message 1 still readable after reconnect (keys retained)
6. Retrying a send with the same transaction ID
PASS  client refuses to queue a second send with a known txnId  — addPendingEvent called on an event with known txnId poc-txn-77a2f5ca
PASS  server returns the same event_id for a replayed txnId  — $Sjl27kYa3I3_G66xzbCI6uU0Xa_ck5BApGWzTf4L9yQ === $Sjl27kYa3I3_G66xzbCI6uU0Xa_ck5BApGWzTf4L9yQ
PASS  recipient sees retried message exactly once  — count=1
7. Late device cannot decrypt earlier messages
PASS  late device cannot decrypt message 1  — reason=HISTORICAL_MESSAGE_NO_KEY_BACKUP
PASS  late device sees ciphertext, not plaintext
8. Logout revokes the device token
PASS  logged-out device's token is rejected
9. Forcing encryption failures: nothing may be sent in plaintext
PASS  client without crypto refuses to send into encrypted room  — This room is configured to use encryption, but your client does not support encryption.
PASS  send rejects when encryption fails  — simulated encryption failure (PoC)
PASS  failed message stays local with status not_sent  — local status=not_sent
PASS  server has no plaintext m.room.message events  — plain=0
PASS  server never received the forbidden strings
PASS  server event count unchanged by the failed sends  — 12 → 12
PASS  encryption works again after the simulated failure  — $3CSbXsSn5xI-f0-XHikU7HOLwCSDQ6IVd9Xkql5z5f0
== 31/31 checks passed.
```

## 3. Server-side evidence (direct SQLite read, run 77a2f5ca)

Inspector output:

```
PASS  room events found in server DB  — 13 events
  event types: {"m.room.create":1,"m.room.member":3,"m.room.power_levels":1,"m.room.join_rules":1,
                "m.room.history_visibility":1,"m.room.guest_access":1,"m.room.encryption":1,"m.room.encrypted":4}
PASS  no m.room.message (plaintext) events stored
PASS  encrypted events present  — 4 m.room.encrypted events
PASS  every encrypted event is megolm ciphertext with no body
PASS  no stored event JSON contains a forbidden plaintext
PASS  forbidden plaintexts absent from the entire DB file  — 1760 KiB scanned, 3 strings
PASS  device key table holds only public keys  — 3 device key records
PASS  forbidden plaintexts absent from homeserver log  — 110 KiB scanned
```

What Alice sent versus what the server holds for the same event (`evidence/stored-event-clean-run.json`):

```json
{
  "sent_plaintext_by_alice": "Hello from Alice. POC-PLAINTEXT-1147f4b83961996e-1",
  "stored_on_server": {
    "type": "m.room.encrypted",
    "room_id": "!QaUrYCLMZYvuElHQmL:localhost",
    "sender": "@poc-alice-77a2f5ca:localhost",
    "content": {
      "algorithm": "m.megolm.v1.aes-sha2",
      "ciphertext": "AwgAEqABIA4Cyo0lnNAAE5xb0afUEJ+sd38yfIlaeGnejtzzasvlhjB9Vlh5oFMYJ9qXKN9UbeJk2t4LafG0fYUZEV8GwOkNjdr57I44g/fT+ywcnF24JP73nq1UjEDVohnpDhcmCcUeMjUhIEzJ8rWbnOCUIJVGqwtuJNnGoeaPraiOT5J+4hr/Ceu21gEg2PQh9lgh4KU9jjkI8Nq3uXpEIIHgRy3HYplSSgsxg/2blhOUZXk+P+2Oad0Dom4yZu/kaRo7la6MIUq3qRhFIWaDOqPL7jGbuEoUWZSwcmF1gqj8kYip5cSSWJnfCg",
      "device_id": "YIYSMCTSKQ",
      "sender_key": "RwXTdSpMEDvVIbN/Py1fvmpAmQK/CKEShOp40kfFOSs",
      "session_id": "qvDA2JHH4EjtDbi9h2+YvyAigj83obCK49rLEijZ4EE"
    },
    "origin_server_ts": 1792524705066
  }
}
```

The server copy carries no `body`, no `msgtype`, and the nonce string is not present anywhere in the database file or the log. A whole-database query returned 0 `m.room.message` events.

## 4. No silent plaintext fallback (step 9)

Two failure modes were forced, each with a unique "MUST-NEVER-BE-SENT" string:

| Forced failure | Observed behaviour | Server after |
|---|---|---|
| Client has no crypto backend (`initRustCrypto` never called) sends into the encrypted room | `sendMessage` rejects: "This room is configured to use encryption, but your client does not support encryption." | Event count unchanged (12 → 12), string absent |
| Crypto backend's `encryptEvent` throws during send | `sendMessage` rejects with the thrown error; the local event stays in the timeline with status `not_sent`; it is cancelled, never retried as plaintext | Event count unchanged, string absent |

After restoring the backend, Alice sent again and Bob decrypted it (message 4), so the failure did not poison the session.

## 5. Network interruption and duplicates (steps 5–6)

- The outage is simulated per client by making every `fetch` reject with a `TypeError` (what a dropped connection looks like to the SDK), with `pollTimeout: 3000` so the in-flight long-poll ends quickly.
- The SDK moved the sync state to `RECONNECTING`, retried, and returned to `SYNCING` once the network came back; the message sent during the outage arrived once; the earlier message remained decryptable (keys retained in the client store).
- Duplicate prevention has two layers: the client refuses to enqueue a second event under a known transaction ID, and the server answered a byte-identical replay of the `PUT …/send/m.room.encrypted/{txnId}` request with the same `event_id`, so a retry after a timeout cannot create a second message.
- The earlier approach of `stopClient()`/`startClient()` on the same client was abandoned: `stopClient()` tears down the crypto backend in matrix-js-sdk 44, so it is not a model of a network interruption. A real app restart with a persistent crypto store is the Phase 2 test, not this one.

## 6. Crypto library check (3f)

| Item | Finding | Source |
|---|---|---|
| Library in use | `@matrix-org/matrix-sdk-crypto-wasm` 18.9.0, pulled in by `matrix-js-sdk` 44.0.0 (`^18.9.0`), loaded via `initRustCrypto()` | lockfile; `pnpm why` |
| What it is | WebAssembly build of the Rust `matrix-sdk-crypto` crate (the `OlmMachine` used by Element X and all official SDKs) | package README |
| Official status | "The current encryption backend is the Rust crypto stack … the only supported backend for new integrations." The legacy `MatrixClient.crypto` / libolm stack is removed from the current SDK API. | matrix-js-sdk README and encryption guide, fetched 2026-10-20 |
| Deprecated? | **No.** `npm view … deprecated` is empty for both packages; latest versions published 2026-09-21 (wasm) and 2026-10-19 (js-sdk). `@matrix-org/olm` (the legacy libolm) is *not* used. | npm registry |
| Licence | Apache-2.0 for both | package metadata; Element licensing post (client SDKs stay Apache-2.0) |

## 7. What the homeserver can still see (metadata)

Confirmed from the stored event and tables during inspection, in line with TRD §6.2:

- Sender user ID and device ID, room ID, and `origin_server_ts` of every encrypted event.
- The encryption algorithm, Megolm `session_id`, and the sender's Curve25519 `sender_key` (public).
- Ciphertext length (318 characters here, which bounds message size).
- Every device's public identity keys and self-signatures (`e2e_device_keys_json`), device display names ("Bob laptop").
- Room membership, join/invite timing, and the fact that the room is a direct chat.
- Access tokens (hashed or plain depending on server version) and login timestamps, IP addresses and user agents in the request log.

None of this is protected by E2EE; the privacy disclosure must say so.

## 8. Re-run against current Synapse in Docker — Verified in CI

**Local machine:** still **Blocked**. There is no `docker` on `PATH` or in the Docker Desktop install locations, no Docker process, no Docker Desktop entry in `winget list`, WSL is "not installed", and no podman/nerdctl.

**GitHub Actions (`poc-e2ee` job in `.github/workflows/ci.yml`):** **Verified.** The identical PoC and inspector ran against the current official image:

| Item | Value |
|---|---|
| Image | `ghcr.io/element-hq/synapse:latest` → `sha256:97665cd4539dcf107c69fb6afdb720e1d1c9c09fb2b5701fb13d6c33b22cd8f0` |
| Synapse version | **1.163.0** (`/_synapse/admin/v1/server_version`) |
| Green runs | [39491618424](https://github.com/MSabbirHossen/communication-system/actions/runs/39491618424) (31/31 PoC, inspection 7/7 with the log scan skipped) and [39492012245](https://github.com/MSabbirHossen/communication-system/actions/runs/39492012245) (31/31 PoC, **inspection 8/8** including the container-log scan) |
| Registration probe | `POST /_matrix/client/v3/register {}` → `401` with `flows: [{stages: ["m.login.dummy"]}]` (dev-only override active) |

How to read the evidence without signing in: GitHub shows step logs and job summaries only to signed-in users, so the job publishes its results as **check annotations**, which are public: `GET https://api.github.com/repos/MSabbirHossen/communication-system/check-runs/<job id>/annotations`. For run 39492012245 the job id is `118867638720`; the annotations read `poc PASS=31 FAIL=0`, `inspect PASS=8 FAIL=0`, and the image digest and server version above. The `poc-evidence` artifact (PoC log, inspector log, generate log, container log, `last-run.json`) is attached to each run for signed-in reviewers.

First-run problems fixed to get there (commits `29d6125` … `3f6679e`): the `runner` context is invalid in job-level `env`; the image writes its files as uid 991 so the dev overrides could not be appended (fixed with `UID`/`GID`); the generated `homeserver.yaml` has no trailing newline so the first override was glued onto a comment line and ignored; the image logs to stdout, so the container log is now captured for the plaintext scan. The pull from `ghcr.io` succeeded on the first attempt.

**What this changes:** every claim in §1–§7 now holds on both Synapse 1.67.0 (local, shimmed) and Synapse 1.163.0 (CI, official image, unmodified). The Windows shim route is no longer load-bearing for the Phase 0 evidence.

## 9. Known limitations of this PoC

- Homeserver was Synapse 1.67.0 with Windows shims, not a current release (see README). CI re-runs the PoC against current Synapse in Docker; that job has not executed yet.
- Crypto store was in-memory (`useIndexedDB: false`); persistence across process restarts was not exercised.
- Verification was manual (`setDeviceVerified` by fingerprint), not interactive SAS/QR; cross-signing was not set up.
- Mobile platforms were not exercised at all.
- All clients ran in one Node process; this does not test cross-platform wire compatibility beyond Node ↔ Node.

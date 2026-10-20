# Phase 0 proof of concept — encrypted direct messaging over Matrix

Throwaway code that answers the Phase 0 questions in `docs/IMPLEMENTATION_PLAN.md` §8. It is **not** application code and will not be reused in `apps/`. Results of the last runs are in `RESULTS.md`; raw check output is in `evidence/`.

## What it does

`src/poc.mjs` drives several Matrix clients in one Node process against a local homeserver:

1. Registers two accounts (Alice, Bob) and signs Bob in on a second device.
2. Initialises the Rust crypto backend (`initRustCrypto`) on every client and prints each device's ed25519 fingerprint.
3. Alice creates an encrypted direct room (`m.room.encryption` set at creation); Bob joins.
4. Alice lists Bob's devices, sees them unverified, and marks them verified by fingerprint.
5. Alice sends a message. The script checks the wire event is `m.room.encrypted` with no body, then waits for both of Bob's devices to decrypt it.
6. Bob's second device loses the network (every HTTP request fails); Alice sends again; the client reports `RECONNECTING`, the network returns, and the device must receive that message exactly once and still read earlier ones.
7. Alice retries a send with the same transaction ID: the SDK refuses to queue a duplicate, and a raw replay of the same HTTP request returns the same event ID from the server.
8. Bob signs in a third device *after* the messages were sent; it must fail to decrypt them (no Megolm key was shared with it).
9. The third device logs out; its access token must then be rejected.
10. No plaintext fallback: a client with no crypto backend is refused when sending into the encrypted room, and a client whose encryption step throws keeps the message local as `not_sent`. The server's event count is unchanged afterwards and never sees the forbidden strings.

`src/inspect-server.mjs` opens the homeserver's SQLite file read-only and checks that the room holds only `m.room.encrypted` events, that no stored JSON has a `body`, that the run's plaintext nonce and forbidden strings appear nowhere in the whole DB file or the log, and that the device-key table holds public keys only.

Nothing here implements cryptography. All of it comes from `matrix-js-sdk` 44.0.0 and `@matrix-org/matrix-sdk-crypto-wasm` 18.9.0 (the WebAssembly build of the Rust `matrix-sdk-crypto` crate).

## Running it

Requirements: Node 22+, pnpm, a dev homeserver with open registration.

```bash
pnpm install
HOMESERVER_URL=http://localhost:8008 pnpm poc
pnpm poc:inspect -- --db /path/to/homeserver.db --log /path/to/homeserver.log
```

## Dev homeserver: supported route vs the route used on 2026-10-20

**Supported route: Synapse in Docker** (or WSL2 on Windows). `.github/workflows/ci.yml` does exactly this with `matrixdotorg/synapse:latest` and the config overrides below. Synapse does not officially support native Windows.

**Route actually used for the recorded runs**, because the development machine had neither Docker Desktop nor WSL2 installed and the session could not install them (non-elevated shell, reboot required):

1. `pip install matrix-synapse` (current version) **failed/stalled**: Synapse ≥ 1.68 ships no Windows wheel and needs a Rust toolchain to build; `cargo` is not installed and the PyPI download ran at ~15 kB/s.
2. Fallback: **Synapse 1.67.0**, the last pure-Python release (September 2022), installed into a virtualenv on Python 3.13 with pins `setuptools<80` (for `pkg_resources`), `pydantic<2`, `prometheus-client<0.15`, and `legacy-cgi`.
3. Three Windows shims were added to that virtualenv only: stub `resource` and `fcntl` modules, and the `assert os.name == "posix"` line in `synapse/rest/media/v1/filepath.py` was replaced with `pass` (media repository is unused by the PoC).
4. Config: `--generate-config --server-name localhost --report-stats=no`, backslashes in generated paths replaced with `/`, then appended:

```yaml
enable_registration: true
enable_registration_without_verification: true
suppress_key_server_warning: true
rc_registration: { per_second: 100, burst_count: 100 }
rc_login:
  address: { per_second: 100, burst_count: 100 }
  account: { per_second: 100, burst_count: 100 }
  failed_attempts: { per_second: 100, burst_count: 100 }
rc_message: { per_second: 100, burst_count: 100 }
```

**Why this is acceptable for Phase 0 and nothing more:** the properties being proven (client-side encryption, ciphertext-only storage, key distribution, idempotent sends, no plaintext fallback) are properties of the client SDK and the Matrix client-server protocol, which Synapse 1.67 implements (client API v1.2 plus `org.matrix.e2e_cross_signing`). It is not evidence about operating a current Synapse. The CI job re-runs the same PoC against current Synapse; Phase 1 must provide a Docker/WSL2 dev homeserver.

## Output

`last-run.json` (git-ignored) carries the room ID, event IDs, nonce and forbidden strings the inspector needs. `evidence/` holds the filtered check output of the recorded runs and one raw stored event dumped from the server database.

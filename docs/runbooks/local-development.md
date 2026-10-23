# Local development setup

Follow this on a clean machine to run the full development environment. Phase 1 exit-gate item 1 is "a new developer can follow this guide successfully".

## 1. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 22.x (`.nvmrc`) | https://nodejs.org |
| pnpm | 12.x | `corepack enable && corepack prepare pnpm@latest --activate`, or https://pnpm.io/installation |
| Docker | Docker Desktop (Windows: WSL2 backend) or Docker Engine | needed for Synapse and MongoDB; `docker version` must work in your shell |
| Git | any recent | |

Windows: run commands from PowerShell or Git Bash; the scripts are Node-based so either works.

## 2. Clone and install

```bash
git clone https://github.com/MSabbirHossen/communication-system.git
```

```bash
cd communication-system && pnpm install --frozen-lockfile
```

## 3. Backing services (Synapse + MongoDB)

```bash
pnpm dev:env:init
```

```bash
pnpm dev:env
```

`dev:env:init` generates the Synapse configuration into `infrastructure/synapse/data/` (git-ignored, contains generated secrets) and appends the development-only overrides (open registration, relaxed rate limits, refresh tokens with 5-minute access tokens). A configuration generated before the refresh-token lines were added behaves the same: Synapse's defaults give the same 5-minute refreshable lifetime. Verify:

```bash
curl http://localhost:8008/_matrix/client/versions
```

```bash
docker compose -f infrastructure/docker-compose.yml ps
```

Both services should report `healthy`.

## 4. Application configuration

```bash
cp apps/api/.env.example apps/api/.env
```

```bash
cp apps/web/.env.example apps/web/.env.local
```

The examples contain placeholders only and work unchanged against the compose services. Missing or invalid variables stop the apps at startup with a message that names the variable (never its value).

## 5. Run the apps

```bash
pnpm dev
```

- API: http://localhost:3000/api/v1/health and http://localhost:3000/api/v1/ready (200 when MongoDB answers, 503 otherwise).
- Web: http://localhost:5173 (Welcome → Chats/People/Settings shell; theme and language in Settings).

## 6. Quality checks (what CI runs)

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

`typecheck` and `test` build the shared packages first because the apps consume their `dist/` output.

## 7. Phase 0 proof of concept against your local Synapse

```bash
HOMESERVER_URL=http://localhost:8008 pnpm poc
```

```bash
pnpm poc:inspect -- --db infrastructure/synapse/data/homeserver.db
```

Expected: 31/31 client checks and 7/7 or 8/8 inspection checks (the log scan needs a log file; the container logs to stdout, see `infrastructure/README.md`).

## 8. Phase 2: identity and device security checks

Service-layer tests against your local Synapse (skipped when `HOMESERVER_URL` is unset):

```bash
HOMESERVER_URL=http://localhost:8008 pnpm test:integration
```

Expected: 3 files, 9 tests pass (the expiry test is skipped unless `ACCESS_TOKEN_LIFETIME_MS` is set; CI sets it to `10000` after shortening `refreshable_access_token_lifetime` to `10s` in the generated `homeserver.yaml`).

Manual two-device check in one browser (each hostname has its own storage, so it acts as a separate device):

1. Start `pnpm dev`. Open http://localhost:5173 and create an account (lowercase username, 8+ character password). The setup screen creates the account's identity and shows the recovery key once; copy it, tick the confirmation and continue. Settings → Devices & security shows one device, **Verified**, with its key fingerprint.
2. Open http://second.localhost:5173 and sign in with the same account. The setup screen asks for the recovery key. Choose **I don't have it — verify from another device**, then **Continue**. Back on the first origin, a "new device signed in" notice appears; **Refresh list** shows the second device as **Not verified**.
3. On the first origin click **Verify** next to the second device. On the second origin a "wants to verify" notice appears: **Review** → **Continue**. Both pages show the same seven emoji in the same order. Click **They match** on both; both report "Device verified" and both device lists show both devices Verified.
4. On the first origin click **Sign out device** for the second device, confirm, and enter the password. The second origin drops to the sign-in screen with "Your session has expired"; in its DevTools → Application → IndexedDB only an empty `cs-session` database remains.
5. Reload the first origin: the session is restored without signing in again. Sign in on the second origin with a wrong password: the message is "Sign-in failed. Check your username and password." (the same for an unknown user). Sign in again with the right password and enter the recovery key this time: "Your identity and encrypted history were restored on this device" and the device is Verified without an emoji comparison.

## 9. Reset everything

```bash
pnpm dev:env:reset
```

Deletes Synapse data and the MongoDB volume, then re-initialises.

## 10. Environment boundaries

| `NODE_ENV` / `VITE_APP_ENV` | Behaviour |
|---|---|
| `development` | verbose logs with stacks; relaxed CORS default `http://localhost:5173` |
| `test` | silent logs; MongoDB database name gets a `_test` suffix |
| `production` | refuses `CORS_ORIGINS=*` and `LOG_LEVEL=debug|trace`; no stacks in logs |

Production deployment (TLS, PostgreSQL for Synapse, secret management) is documented in later phases; this compose file is for development only.

## 11. Troubleshooting

- `docker: command not found`: install Docker Desktop and reopen the terminal.
- Synapse never becomes healthy: `docker logs cs-synapse`; a wrong `UID/GID` in `infrastructure/.env` makes `/data` unwritable, rerun `pnpm dev:env:reset`.
- `Registration has been disabled` from the PoC: the overrides were not appended on a new line; rerun `pnpm dev:env:reset`.
- API exits with `Invalid environment configuration`: the message lists the variable names to fix in `apps/api/.env`.

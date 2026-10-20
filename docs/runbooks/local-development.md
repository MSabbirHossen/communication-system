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

`dev:env:init` generates the Synapse configuration into `infrastructure/synapse/data/` (git-ignored, contains generated secrets) and appends the development-only overrides. Verify:

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

## 8. Reset everything

```bash
pnpm dev:env:reset
```

Deletes Synapse data and the MongoDB volume, then re-initialises.

## 9. Environment boundaries

| `NODE_ENV` / `VITE_APP_ENV` | Behaviour |
|---|---|
| `development` | verbose logs with stacks; relaxed CORS default `http://localhost:5173` |
| `test` | silent logs; MongoDB database name gets a `_test` suffix |
| `production` | refuses `CORS_ORIGINS=*` and `LOG_LEVEL=debug|trace`; no stacks in logs |

Production deployment (TLS, PostgreSQL for Synapse, secret management) is documented in later phases; this compose file is for development only.

## 10. Troubleshooting

- `docker: command not found`: install Docker Desktop and reopen the terminal.
- Synapse never becomes healthy: `docker logs cs-synapse`; a wrong `UID/GID` in `infrastructure/.env` makes `/data` unwritable, rerun `pnpm dev:env:reset`.
- `Registration has been disabled` from the PoC: the overrides were not appended on a new line; rerun `pnpm dev:env:reset`.
- API exits with `Invalid environment configuration`: the message lists the variable names to fix in `apps/api/.env`.

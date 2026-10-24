# Local development environment

`docker-compose.yml` runs the two backing services the clients and the API need locally. **Development only**: registration is open and unverified, and there is no TLS.

| Service | Image | Port | Data |
|---|---|---|---|
| Synapse (Matrix homeserver) | `ghcr.io/element-hq/synapse:latest` | 8008 | `./synapse/data` (git-ignored; holds generated secrets and the SQLite DB) |
| MongoDB | `mongo:7` | 27017 | named volume `mongo-data` |
| Push gateway stub (dev only) | `node:22-alpine` running `./push-stub/server.mjs` | 8010 | in memory |

## Commands (from the repo root)

```bash
pnpm dev:env:init
```

```bash
pnpm dev:env
```

```bash
pnpm dev:env:down
```

```bash
pnpm dev:env:reset
```

`dev:env:init` needs Docker (Docker Desktop with the WSL2 backend on Windows). It generates `synapse/data/homeserver.yaml` once, appends `synapse/dev-overrides.yaml` on a new line, and writes `infrastructure/.env` with your uid/gid so the container writes files you can read.

Verify: `curl http://localhost:8008/_matrix/client/versions` returns JSON; `docker compose -f infrastructure/docker-compose.yml ps` shows Synapse and MongoDB `healthy`.

The push stub (`curl http://localhost:8010/health`) records what the homeserver sends to a push gateway; the integration test `apps/web/test/integration/push.integration.test.ts` registers a content-free pusher against it and asserts only identifiers arrive (THREAT_MODEL TM-12). Synapse reaches it as `http://cs-push-stub:8010/_matrix/push/v1/notify`, which needs the `ip_range_whitelist` entry from `synapse/dev-overrides.yaml` (re-run `pnpm dev:env:init` or append it to an existing `synapse/data/homeserver.yaml`).

## Why SQLite for Synapse here

The PoC and the dev environment only need a working Matrix server. PostgreSQL is a deployment concern (Phase 7/8 runbooks). Do not reuse this compose file for staging or production.

## Reset

`pnpm dev:env:reset` stops the services, deletes `synapse/data` and the MongoDB volume, and re-initialises. All local accounts and messages are lost; that is the point.

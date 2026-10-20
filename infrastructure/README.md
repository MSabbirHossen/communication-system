# Local development environment

`docker-compose.yml` runs the two backing services the clients and the API need locally. **Development only**: registration is open and unverified, and there is no TLS.

| Service | Image | Port | Data |
|---|---|---|---|
| Synapse (Matrix homeserver) | `ghcr.io/element-hq/synapse:latest` | 8008 | `./synapse/data` (git-ignored; holds generated secrets and the SQLite DB) |
| MongoDB | `mongo:7` | 27017 | named volume `mongo-data` |

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

Verify: `curl http://localhost:8008/_matrix/client/versions` returns JSON; `docker compose -f infrastructure/docker-compose.yml ps` shows both services `healthy`.

## Why SQLite for Synapse here

The PoC and the dev environment only need a working Matrix server. PostgreSQL is a deployment concern (Phase 7/8 runbooks). Do not reuse this compose file for staging or production.

## Reset

`pnpm dev:env:reset` stops the services, deletes `synapse/data` and the MongoDB volume, and re-initialises. All local accounts and messages are lost; that is the point.

# Communication System

Privacy-focused, end-to-end encrypted one-to-one messaging for web, Android and iOS. Matrix-first architecture (ADR-0001, accepted); mobile apps are a Capacitor wrapper around the web client (provisional, ADR-0001 C2).

**Current phase:** see `docs/STATUS.md`.

## Documents

| Document | Purpose |
|---|---|
| `docs/PRD.md` | Product requirements |
| `docs/TRD.md` | Technical requirements |
| `docs/IMPLEMENTATION_PLAN.md` | Phases, exit gates |
| `docs/APP_FLOW.md`, `docs/UI_UX_BRIEF.md` | Journeys and design |
| `docs/BACKEND_SCHEMA.md` | Application-owned data (MongoDB) |
| `docs/architecture/` | ADR-0001 (messaging architecture), ADR-0002 (repository and tooling), mobile spike |
| `docs/security/THREAT_MODEL.md` | Threat model |
| `docs/runbooks/local-development.md` | Setup guide |
| `docs/STATUS.md` | Current phase, evidence, blockers |
| `AGENTS.md` | Engineering rules for AI and human contributors |

## Quick start

Requirements: Node 22, pnpm 12, Docker.

```bash
pnpm install --frozen-lockfile
```

```bash
pnpm dev:env:init && pnpm dev:env
```

```bash
pnpm dev
```

Full instructions, verification steps and troubleshooting: `docs/runbooks/local-development.md`.

## Commands

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

CI (`.github/workflows/ci.yml`) runs those, scans for secrets, boots the compose environment, checks API readiness and runs the Phase 0 proof of concept against a current Synapse.

## Layout

```text
communication-system/
├── apps/
│   ├── web/            # React + Vite client (app shell in Phase 1)
│   ├── api/            # Express + MongoDB application API (health/readiness in Phase 1)
│   └── mobile/         # Capacitor shell around apps/web (platforms added in Phase 5)
├── packages/
│   ├── design-tokens/  # tokens.json → CSS variables + typed object
│   ├── shared-types/   # types shared by web and api
│   ├── validation/     # zod schemas, env validation (names only in errors)
│   └── logger/         # privacy-safe logging (pino + browser adapter)
├── infrastructure/     # docker-compose for Synapse + MongoDB, Synapse init script
├── poc/matrix-e2ee/    # Phase 0 proof of concept (throwaway, still run in CI)
├── docs/               # requirements, ADRs, security, runbooks, status
└── .github/workflows/  # CI
```

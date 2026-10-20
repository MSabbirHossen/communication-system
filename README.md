# Communication System

Privacy-focused, end-to-end encrypted one-to-one messaging for web, Android and iOS. Matrix-first architecture: see `docs/architecture/ADR-0001-messaging-architecture.md`.

**Current phase:** Phase 0 — architecture validation (`docs/STATUS.md`).

## Documents

| Document | Purpose |
|---|---|
| `docs/PRD.md` | Product requirements |
| `docs/TRD.md` | Technical requirements |
| `docs/IMPLEMENTATION_PLAN.md` | Phases, exit gates |
| `docs/APP_FLOW.md`, `docs/UI_UX_BRIEF.md` | Journeys and design |
| `docs/BACKEND_SCHEMA.md` | Application-owned data (MongoDB) |
| `docs/architecture/` | Architecture decision records and the mobile spike (`MOBILE_SPIKE.md`) |
| `docs/security/THREAT_MODEL.md` | Threat model |
| `docs/STATUS.md` | Current phase, evidence, blockers |
| `AGENTS.md` | Engineering rules for AI and human contributors |

## Setup

Requirements: Node 22+, pnpm 12+.

```bash
pnpm install --frozen-lockfile
```

## Commands

```bash
pnpm lint        # ESLint (flat config)
pnpm typecheck   # tsc, strict, checkJs over PoC sources
pnpm test        # Vitest unit tests
pnpm build       # no application packages yet (placeholder)
```

CI (`.github/workflows/ci.yml`) runs the four commands above on every push and pull request, then runs the Phase 0 encrypted-messaging proof of concept against a current Synapse in Docker.

## Phase 0 proof of concept

`poc/matrix-e2ee/` proves encrypted direct messaging over Matrix with the official SDK. See its `README.md` for how to run it and `RESULTS.md` for the recorded evidence. It is throwaway code, not application code.

## Layout

```text
communication-system/
├── docs/                 # requirements, ADRs, security, status
├── poc/matrix-e2ee/      # Phase 0 proof of concept (throwaway)
├── .github/workflows/    # CI
├── apps/                 # (Phase 1) web, mobile, api
└── packages/             # (Phase 1) shared code
```

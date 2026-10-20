# ADR-0002 — Repository layout, tooling and environment boundaries

**Status:** Accepted (Phase 1 plan approved by the project owner on 2026-10-20)  
**Date:** 2026-10-21  
**Deciders:** Project owner  
**Inputs:** IMPLEMENTATION_PLAN §4 Phase 1; TRD §4.1, §14, §15; AGENTS.md §5.2, §7, §11; ADR-0001 (Capacitor for mobile).

## Context

Phase 1 must give the project a reproducible development environment and the structure later phases build on, without starting Matrix integration, authentication or messaging UI. The mobile decision changed the layout from the original React Native assumption.

## Decisions

| Area | Decision | Why |
|---|---|---|
| Workspace | pnpm workspace with `apps/*`, `packages/*`, `poc/*`; package names `@cs/*` | Single lockfile, topological builds, workspace links; the PoC stays isolated |
| Apps | `apps/web` (React 19 + Vite 8 + TS), `apps/api` (Express 5 + MongoDB driver), `apps/mobile` (Capacitor 8 shell, platforms added in Phase 5) | Matches ADR-0001; no React Native |
| Shared packages | `@cs/design-tokens`, `@cs/shared-types`, `@cs/validation`, `@cs/logger` | Four packages with one job each; nothing extracted for abstraction (IMPLEMENTATION_PLAN §4) |
| Package consumption | Packages compile to `dist/` with `tsc`; apps import the built output; root `typecheck`/`test`/`dev` build packages first | Works identically for Vite (web), tsx/node (api) and vitest without path aliases |
| TypeScript | 6.0.x pinned (typescript-eslint 8.72 refuses the TypeScript 7.0 API; revisit when it supports ≥7.1), strict plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax` in `tsconfig.base.json`; NodeNext for Node packages, bundler resolution for the web app | TRD §14.2 strict mode |
| pnpm build scripts | `allowBuilds: { esbuild: true }` in `pnpm-workspace.yaml` (pnpm ≥ 11 blocks postinstall scripts and fails `install` otherwise) | Vite/Vitest need esbuild's binary |
| Typecheck mechanics | Per-package `tsc -p` (no `tsc -b` project references) | Simpler with mixed emit/no-emit projects; the PoC keeps `checkJs` |
| Lint/format | ESLint 10 flat config with typescript-eslint, react-hooks and jsx-a11y (web only), Prettier via `eslint-config-prettier`; `format:check` in CI | Automated formatting and linting (TRD §14.2) |
| Tests | Vitest 5 with workspace projects; Testing Library + jsdom for the web shell; supertest against the Express app factory | Behavioural tests over the app factory, not a listening server |
| Routing / state | React Router 8; no state library in Phase 1 | The state strategy is decided in Phase 3 when Matrix sync state exists |
| API data access | Official `mongodb` driver, no ODM; no collections in Phase 1 | Collections and indexes are a Phase 6 deliverable (BACKEND_SCHEMA.md); an ODM adds a second schema language |
| Env validation | `@cs/validation` `parseEnv` on zod 4; errors list variable names only; boundaries: test → `_test` database and silent logs; production refuses `CORS_ORIGINS=*` and debug/trace logging | AGENTS.md §11, TRD §15.1 |
| Logging | `@cs/logger`: pino with `redact` plus a deep scrubber in `formatters.log`; browser adapter on `console`; no network transport | AGENTS.md §6, TRD §9.2/§10.3 |
| Dev services | `infrastructure/docker-compose.yml`: Synapse (SQLite, official `ghcr.io/element-hq/synapse` image) and `mongo:7`; `init.mjs` generates config and appends `dev-overrides.yaml` | Same image the Phase 0 CI evidence used; SQLite is enough for development; PostgreSQL is a deployment concern |
| CI | `checks` (format, lint, typecheck, test, build, advisory `pnpm audit`), `secrets-scan` (gitleaks), `dev-env` (compose + API readiness + PoC), `poc-e2ee` kept until `dev-env` is proven | TRD §14.3 |
| Web CSP | Development CSP meta in `index.html` (`'unsafe-inline'` for styles only, no third-party origins); production hardening in Phase 4/7 | THREAT_MODEL TM-11 |

## Consequences

- `pnpm dev` and the quality scripts build the shared packages first; a stale `dist/` shows up as a type error, not a runtime surprise.
- Adding a package means: `packages/<name>` with `tsconfig.json` (noEmit) and `tsconfig.build.json` (emit), `vitest.config.ts`, and an entry in no central list (pnpm globs pick it up).
- The web app has no raw colors; every component reads semantic tokens from `@cs/design-tokens`.
- Native mobile projects are deliberately absent until the ADR-0001 C2 device spike.

## Revisit when

- Vitest or TypeScript major upgrades change project-reference support.
- Phase 3 picks a state-management approach (record in a new ADR).
- Phase 6 adds collections (BACKEND_SCHEMA.md becomes the schema ADR).

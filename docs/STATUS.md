# Project Status

## Active phase
Phase 1 — Repository, environments and application foundation (**implemented locally; awaiting owner review before push**)

## Last completed milestone
Phase 0 complete and approved with conditions (2026-10-20): ADR-0001 Accepted; E2EE PoC verified locally (Synapse 1.67.0) and in CI (Synapse 1.163.0), 31/31 client checks and 8/8 server-inspection checks.

## Current task
Phase 1 implementation per the approved plan (nine commits on `main`, not yet pushed). Owner review of this report, then push and watch the first CI run of the new `dev-env` and `secrets-scan` jobs.

## Completed (Phase 1)
Labels follow AGENTS.md §12.

| Deliverable | Status | Evidence |
|---|---|---|
| Workspace tooling: strict `tsconfig.base.json`, ESLint 10 flat config (typescript-eslint, react-hooks, jsx-a11y, prettier), Prettier, Vitest workspace projects, root scripts | Verified | `pnpm format:check`, `pnpm lint`, `pnpm typecheck` all pass |
| `@cs/design-tokens`: tokens from UI/UX brief §4/§8 → CSS variables (light/dark/system) + typed object; WCAG AA contrast tests | Verified | 36 tests pass; `dist/tokens.css` generated |
| `@cs/logger`: pino with redaction + deep scrubber; browser adapter; no network transport | Verified | 9 tests (secret values never emitted; stacks only outside production) |
| `@cs/validation`: `parseEnv` (names only in errors), env helpers | Verified | 5 tests |
| `@cs/shared-types` | Implemented | builds; consumed by api/web |
| `@cs/api`: Express 5 app factory, helmet, CORS allowlist, request id, privacy-safe request log, 64 KB body limit, rate limit, `/api/v1/health`, `/api/v1/ready` (Mongo ping), error envelope, env boundaries | Verified | 14 tests (supertest); manual: fails fast with `MONGODB_URI (missing)`, refuses `CORS_ORIGINS=*` in production, exits non-zero on unreachable Mongo |
| `@cs/web`: Vite + React 19 shell, React Router, two-pane ≥1024px / bottom nav below, theme (system/light/dark, persisted), offline banner, error boundary, lang/dir plumbing, dev CSP | Verified | 9 tests; manual in built-in browser: rail + 2 panes at 1200px, bottom nav + 1 pane at 375px, Light theme applied and stored (`cs.theme`), `lang=en dir=ltr` |
| `@cs/mobile`: Capacitor config and sync script; platforms deferred to Phase 5 | Implemented | typecheck passes; `pnpm --filter @cs/mobile build` builds web and reports "no native platforms" |
| `infrastructure/`: docker-compose (Synapse + MongoDB), cross-platform `init.mjs`, `dev-overrides.yaml` (no secrets), README | Implemented, **not executed locally** (no Docker on this machine) | YAML validated; identical steps run in the CI `dev-env` job (not yet run) |
| CI: `checks` (+format, audit advisory), `secrets-scan` (gitleaks), `dev-env` (compose + API readiness + PoC), `poc-e2ee` kept | Implemented, **not yet run** | YAML validated; will run on push |
| Docs: ADR-0002, `docs/runbooks/local-development.md`, README, package READMEs | Implemented | files |
| Full build (`pnpm build`) | Verified | packages, api, web (411 kB JS, 7.7 kB CSS), mobile |

## Verification
Executed 2026-10-21 on Windows 11, Node 22.20.0, pnpm 12.9.1, TypeScript 6.0.3:

- `pnpm format:check` — pass. `pnpm lint` — pass (0 problems). `pnpm typecheck` — pass (packages, api, web, mobile, PoC).
- `pnpm test` — 8 files, **84 tests pass** (design-tokens 36, logger 9, validation 5, api 14, web 9, poc 11).
- `pnpm build` — pass.
- API manual: no env → `api failed to start: Invalid environment configuration (1 issue): MONGODB_URI (missing)`; unreachable Mongo → `connect ECONNREFUSED`, exit 1; production with `CORS_ORIGINS=*` → refused.
- Web manual (built-in browser, `pnpm --filter @cs/web dev`): layouts, theme, locale attributes as listed above. Offline banner verified by unit test (mocked `navigator.onLine`); not toggled manually (the browser pane has no network toggle). Console: no errors after removing `frame-ancestors` from the meta CSP (header-only directive).
- Not verified locally: docker-compose environment and the `dev-env`/`secrets-scan` CI jobs (Docker absent; nothing pushed).

## Blockers and risks
- **B2 — Docker Desktop not installed locally.** The compose environment and `init.mjs` are untested on this machine; first proof will be the CI `dev-env` job, then the owner's local run. Risk: first-run fixes to `init.mjs` or the compose healthchecks.
- **R1 — Mobile E2EE on real devices untested** (ADR-0001 C2, Phase 5).
- **R5 — Toolchain pins.** TypeScript is pinned to 6.0.3 because typescript-eslint rejects the TypeScript 7.0 API; revisit when typescript-eslint supports ≥7.1. pnpm needs `allowBuilds: { esbuild: true }`.
- `pnpm audit` is advisory in CI until Phase 7; `uuid@7.0.3` deprecated subdependency noted at install.

## Deferred
| Item | Reason | Risk while deferred |
|---|---|---|
| Local compose run and runbook walkthrough on this machine | Docker not installed | Low–medium: covered by CI `dev-env`; owner to run after installing Docker Desktop |
| Native Android/iOS projects and device spike | Phase 5 (ADR-0001 C2) | Medium (documented fallback) |
| Production CSP, real rate limits, monitoring | Phases 4/7 | Low |
| Matrix SDK integration, auth, messaging UI, MongoDB collections | Phases 2/3/6 | n/a |

## Next approved action
Owner reviews this report; on approval the AI pushes `main`, watches the CI run (`checks`, `secrets-scan`, `dev-env`, `poc-e2ee`) and fixes first-run problems in the `dev-env` job if any. Phase 1 exit gate is evaluated after CI is green and the owner has run the runbook locally with Docker Desktop.

## Last updated
2026-10-21

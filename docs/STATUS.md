# Project Status

## Active phase
Phase 2 — Identity, authentication and device security (**planning only; no implementation until the owner approves the plan**)

## Last completed milestone
**Phase 1 complete — exit gate closed 2026-10-23.** Both halves satisfied: CI green on the tip of `main` (run 39899908581 at `9972177`: checks, secrets-scan, dev-env and poc-e2ee all green; dev-env on Synapse 1.163.1 with API `/ready` 200, PoC 31/31, inspection 8/8) and the owner's local walkthrough of `docs/runbooks/local-development.md` on Windows with Docker Desktop (WSL2 backend), reported passed with no errors.

Owner commits made during the walkthrough, outside the agent session (reconciled 2026-10-23):
- `37c3241`, `485f8f5` `infrastructure/synapse/init.mjs`: spawn `docker` without a shell on every platform and handle spawn errors explicitly (the shell-on-Windows path was unnecessary with Docker Desktop on PATH); clearer "start Docker Desktop" message.
- `9972177` `poc/matrix-e2ee/src/inspect-server.mjs`: resolve relative `--db`/`--log` paths against `INIT_CWD` and the workspace root, so `pnpm poc:inspect -- --db infrastructure/synapse/data/homeserver.db` works from the repo root as the runbook says. Absolute paths (used by CI) are unchanged.
- CI history: run 39897001091 on `37c3241` failed `format:check` (Prettier), fixed in the following commits; run 39899908581 on the tip is green. Local re-check on the tip the same day: format, lint, typecheck and 84 tests pass.

Phase 0 complete and approved with conditions (2026-10-20): ADR-0001 Accepted; E2EE PoC verified locally (Synapse 1.67.0) and in CI (Synapse 1.163.0/1.163.1).

## Current task
Phase 2 plan for owner approval (AGENTS.md step 2), checked against the Phase 2 exit gate in IMPLEMENTATION_PLAN.md. No Phase 2 code until approved.

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
| `infrastructure/`: docker-compose (Synapse + MongoDB), cross-platform `init.mjs`, `dev-overrides.yaml` (no secrets), README | **Verified in CI** (`dev-env` job: both services healthy, init script appended overrides, registration probe 401 with dummy flow); not executed locally (no Docker on this machine) | run 39506556177 |
| CI: `checks` (+format, audit advisory), `secrets-scan` (gitleaks), `dev-env` (compose + API readiness + PoC), `poc-e2ee` kept | **Verified green** — `dev-env`: API `/health` 200, `/ready` 200 `{mongo: ok}`, auth header absent from logs, PoC 31/31, inspection 8/8 on Synapse 1.163.0 | https://github.com/MSabbirHossen/communication-system/actions/runs/39506556177 |
| Docs: ADR-0002, `docs/runbooks/local-development.md`, README, package READMEs | Implemented | files |
| Full build (`pnpm build`) | Verified | packages, api, web (411 kB JS, 7.7 kB CSS), mobile |

## Verification
Executed 2026-10-21 on Windows 11, Node 22.20.0, pnpm 12.9.1, TypeScript 6.0.3:

- `pnpm format:check` — pass. `pnpm lint` — pass (0 problems). `pnpm typecheck` — pass (packages, api, web, mobile, PoC).
- `pnpm test` — 8 files, **84 tests pass** (design-tokens 36, logger 9, validation 5, api 14, web 9, poc 11).
- `pnpm build` — pass.
- API manual: no env → `api failed to start: Invalid environment configuration (1 issue): MONGODB_URI (missing)`; unreachable Mongo → `connect ECONNREFUSED`, exit 1; production with `CORS_ORIGINS=*` → refused.
- Web manual (built-in browser, `pnpm --filter @cs/web dev`): layouts, theme, locale attributes as listed above. Offline banner verified by unit test (mocked `navigator.onLine`); not toggled manually (the browser pane has no network toggle). Console: no errors after removing `frame-ancestors` from the meta CSP (header-only directive).
- CI run 39505423225 (first push) failed twice on first-run issues, fixed in `c01b3a2`: gitleaks flagged a literal Bearer probe header in the workflow (now built at runtime, historical literal allowlisted; local `gitleaks git` and `gitleaks dir` scans clean), and the inspector could not open the compose Synapse SQLite file in place (now inspected from a runner-owned copy). Run 39506556177: all four jobs green.
- Not verified locally: the docker-compose environment (Docker absent on this machine).

## Blockers and risks
- B2 resolved 2026-10-23: Docker Desktop installed; `init.mjs` and the compose environment proven on Windows by the owner's walkthrough.
- **R1 — Mobile E2EE on real devices untested** (ADR-0001 C2, Phase 5).
- **R5 — Toolchain pins.** TypeScript is pinned to 6.0.3 because typescript-eslint rejects the TypeScript 7.0 API; revisit when typescript-eslint supports ≥7.1. pnpm needs `allowBuilds: { esbuild: true }`.
- `pnpm audit` is advisory in CI until Phase 7; `uuid@7.0.3` deprecated subdependency noted at install.

## Deferred
| Item | Reason | Risk while deferred |
|---|---|---|
| Native Android/iOS projects and device spike | Phase 5 (ADR-0001 C2) | Medium (documented fallback) |
| Production CSP, real rate limits, monitoring | Phases 4/7 | Low |
| Matrix SDK integration, auth, messaging UI, MongoDB collections | Phases 2/3/6 | n/a |

## Decisions recorded 2026-10-21
- **Phase 1 gate path: A — done.** The owner ran `docs/runbooks/local-development.md` on Windows with Docker Desktop (WSL2 backend) on 2026-10-23: passed. Gate closed the same day.
- **Repository visibility: public (final).** (github.com/MSabbirHossen/communication-system). Consequence: CI logs and job summaries are visible only to signed-in users, so results are published as public check annotations; no secrets are committed (gitleaks in CI, history scanned clean). Revisit before any real-user beta (Phase 8) together with the human security review.
- Still provisional: Capacitor for mobile (ADR-0001 C2); Phase 5 needs a real Android and iOS device test before it is final.

## Next approved action
Produce the Phase 2 plan (plan mode, no code) and present it for approval. Implementation starts only after the owner approves the plan.

## Last updated
2026-10-23

# Communication System — AI Engineering & Maintenance Rules

**Document:** `AGENTS.md`  
**Version:** 1.0  
**Applies to:** All AI coding agents, automated contributors, and AI-assisted development workflows  
**Project:** Communication System  
**Status:** Mandatory engineering policy

---

## 1. Mission and Responsibilities

You are an AI engineering contributor responsible for helping build, maintain, test, document, and improve the Communication System.

Your responsibility is not simply to complete the immediate coding request. You must preserve the project's long-term integrity, security, maintainability, and approved architecture.

Every change must be:

- Correct for the stated requirement.
- Consistent with existing architecture and conventions.
- Secure by design.
- Tested to an appropriate level.
- Documented when it changes behavior, architecture, or setup.
- Small enough to review and verify.
- Reversible when practical.
- Explicit about anything that remains incomplete.

**Definition of success:** the requested change works, existing functionality remains intact, applicable tests pass, security requirements are preserved, and the project owner can understand and verify the result.

## 2. Source of Truth and Instruction Priority

Before making changes, inspect the repository and determine the current project state.

Use the following priority order:

1. Explicit instructions from the project owner in the current task.
2. Security requirements and approved architecture decisions.
3. This `AGENTS.md` and any more-specific repository or directory-level agent instructions.
4. Approved product and technical requirements.
5. Existing implementation and established conventions.
6. Reasonable engineering judgment, clearly documented when it introduces a new decision.

If two requirements conflict, do not silently choose whichever is easier. Explain the conflict and request clarification when the decision materially affects security, architecture, scope, or user-visible behavior.

### Required project documents

Check whether these documents exist before relying on them:

- `README.md` — setup, commands, project overview.
- `docs/PRD.md` — product requirements.
- `docs/TRD.md` — technical requirements.
- `docs/APP_FLOW.md` — navigation and user journeys.
- `docs/UI_UX_BRIEF.md` — design system and interaction requirements.
- `docs/BACKEND_SCHEMA.md` — application-owned data model.
- `docs/IMPLEMENTATION_PLAN.md` — phases, milestones and exit criteria.
- `docs/architecture/` — architecture decision records and system diagrams.
- `docs/security/` — threat model, security policies and security testing.
- `docs/STATUS.md` — current phase, completed work, blockers and next action.

These are suggested canonical paths. If equivalent documents already exist elsewhere, preserve their established locations or document an approved migration. Do not create duplicate competing sources of truth.

Never claim a document exists, a decision is approved, or a task is complete without verifying the repository or the relevant project record.

## 3. Mandatory Workflow Before Every Change

Follow this workflow for every implementation task.

### Step 1 — Understand

- Restate the objective internally and identify the expected outcome.
- Identify the active phase and relevant acceptance criteria.
- Inspect the relevant source files, tests, configuration and documentation.
- Check repository status and existing uncommitted changes.
- Identify security, privacy, compatibility and migration implications.

Do not overwrite the project owner's existing changes.

### Step 2 — Plan

For non-trivial tasks, provide a short plan containing:

1. Files or components expected to change.
2. Intended implementation.
3. Tests and verification required.
4. Security or compatibility considerations.
5. Expected commit message.
6. Acceptance criteria for completion.

For a small, low-risk change, use a concise plan. Do not create unnecessary process overhead for a typo or similarly trivial fix.

### Step 3 — Implement

- Make the smallest coherent change that satisfies the requirement.
- Follow existing code conventions.
- Prefer readable, typed, maintainable code over clever shortcuts.
- Reuse established abstractions when appropriate.
- Avoid unrelated refactoring.
- Preserve existing public interfaces unless a change is explicitly required.
- Add tests alongside new behavior.
- Update documentation when behavior, setup, architecture or operations change.

### Step 4 — Verify

Run the applicable checks, including:

- Formatting and linting.
- Type checking.
- Unit tests.
- Integration tests.
- Relevant end-to-end tests.
- Production builds.
- Security-specific tests where applicable.
- Manual verification of platform-specific behavior when required.

Inspect the final diff for accidental changes, exposed secrets, debugging code, unsafe defaults and unrelated modifications.

If a check cannot be run, state why. Never report a check as passing unless it actually ran successfully.

### Step 5 — Report

Provide a concise implementation report describing:

- What changed.
- Why it changed.
- Important files modified.
- Tests and commands executed, including results.
- Manual verification still required.
- Known limitations and unresolved issues.
- Database migrations, configuration changes or deployment steps.
- The proposed Conventional Commit message.
- Whether the phase exit gate remains open or is satisfied.

### Step 6 — Stop at the boundary

Do not automatically proceed to the next implementation phase.

After completing the current task, report the result and wait for the project owner's approval before starting the next phase or making unrelated changes.

---

## 4. Phase Management and Exit Gates

The project follows a gated implementation plan.

| Phase | Focus | Exit requirement |
|---|---|---|
| 0 | Architecture and encryption proof of concept | Architecture, licensing and SDK feasibility validated |
| 1 | Repository and development foundation | Reproducible setup and automated checks |
| 2 | Identity and device security | Authentication and device lifecycle verified |
| 3 | Encrypted direct messaging | Cross-account encryption, decryption and sync verified |
| 4 | Web experience | Core web journeys and accessibility checks verified |
| 5 | Android and iOS | Platform builds and cross-platform messaging verified |
| 6 | Application backend | Authorization, data integrity and API tests pass |
| 7 | Security and reliability | Required security and recovery checks pass |
| 8 | Closed beta | Release criteria and operational readiness satisfied |

The durations in the implementation plan are estimates, not permission to skip validation.

### Rules

- Work only within the approved active phase unless the owner authorizes an exception.
- A phase is not complete because its screens exist or its code compiles.
- Do not mark a phase complete while mandatory acceptance criteria remain unmet.
- Record deferred work explicitly, including its reason and risk.
- If a critical prerequisite fails, stop dependent implementation and report the blocker.
- A phase may be reopened if a regression or newly discovered security issue invalidates its exit criteria.
- Keep the project status document accurate after each meaningful milestone.

Never change phase status merely to make progress appear faster.

## 5. Architecture Guardrails

### 5.1 Matrix-first messaging architecture

The current proposed architecture is Matrix-first, pending the Phase 0 validation gate.

Until an approved architecture decision says otherwise:

- Use supported Matrix APIs and client SDKs for messaging protocol operations.
- Treat the Matrix implementation as the source of truth for protocol-owned data.
- Do not build a parallel custom messaging protocol.
- Do not create a duplicate MongoDB messages collection.
- Do not duplicate Matrix rooms, membership, encrypted events, device cryptographic state or synchronization state in MongoDB.
- Keep product-specific functionality in the application API.
- Document any deviation in an architecture decision record.

If Phase 0 rejects Matrix or chooses another architecture, update the approved architecture documentation first and revise affected implementation rules accordingly.

### 5.2 Technology choices

Use the approved stack and versions recorded in the repository.

The current proposed stack is:

- Web: React, TypeScript and Vite.
- Mobile: React Native and TypeScript, subject to SDK compatibility.
- Application API: Node.js, TypeScript and Express, if required.
- Application-owned data: MongoDB, only where justified.
- Messaging and encryption: a supported implementation of the approved protocol.
- CI/CD: repository-native automated checks and deployment workflows.

Do not introduce a new framework, database, state-management library, SDK or infrastructure service without establishing a clear need and checking compatibility, licensing, maintenance status and operational cost.

### 5.3 Data ownership

Every field and collection must have a documented owner and purpose.

- Matrix owns protocol-level messaging state.
- The application database owns only approved application-specific state.
- Client-side local storage must follow the approved security design.
- Push notifications must not expose message contents by default.
- Audit logs must not contain secrets or decrypted private messages.

Do not create abstractions or data stores that duplicate an existing source of truth without an approved reason.

---

## 6. Mandatory Security Rules

Security is a release requirement, not an optional enhancement.

### Encryption

- Never implement cryptographic primitives or messaging protocols from scratch.
- Use a supported, reviewed protocol implementation and compatible SDKs.
- Encrypt and decrypt messages on authorized clients as required by the approved protocol.
- Never introduce silent plaintext fallback.
- Never send private encryption keys to the application backend.
- Never log decrypted message bodies, private keys or recovery secrets.
- Test encryption behavior at the protocol boundary, not just through UI indicators.

### Authentication and authorization

- Never trust a user ID supplied by the client as proof of identity.
- Enforce authorization on every protected server operation.
- Apply least privilege to database accounts, service accounts and moderators.
- Protect session and credential handling.
- Never expose secrets through API responses, logs, source control or error messages.
- Do not weaken authentication or verification to make a test pass.

### Device security

- Preserve the distinction between signing in and trusting a device.
- Use the selected SDK's supported device verification and key lifecycle mechanisms.
- Test device revocation and identity-change scenarios.
- Do not invent recovery behavior or imply that lost encryption keys can always be restored.
- Clearly communicate security limitations to the user.

### Privacy

- Collect the minimum data necessary for the documented feature.
- Respect privacy and discoverability settings on the server, not just in the UI.
- Never silently collect decrypted private conversation content.
- Make user-submitted report evidence explicit and consent-based.
- Apply documented retention and deletion rules.
- Avoid including sensitive user data in analytics and diagnostic reports.

### Vulnerability handling

If a serious vulnerability is discovered:

1. Stop work that would worsen or depend on the vulnerable behavior.
2. Explain the impact and affected components.
3. Propose a minimal remediation.
4. Add a regression test where practical.
5. Verify the fix and relevant surrounding behavior.
6. Document any remaining risk.

Do not hide a security failure merely because the requested feature is otherwise complete.

---

## 7. Code Quality and Maintainability

### General rules

- Use TypeScript where the approved stack supports it.
- Avoid `any`; when unavoidable, explain and constrain it.
- Validate untrusted input at application boundaries.
- Keep functions and components focused on one clear responsibility.
- Avoid unnecessary abstractions and premature optimization.
- Handle errors explicitly and consistently.
- Use centralized validation and error-handling conventions where established.
- Avoid silent catches and ignored promises.
- Remove temporary debugging output before completion.
- Do not suppress lint or type errors without documenting the reason.
- Keep dependencies minimal and maintained.
- Follow accessibility and localization conventions.

### React and UI rules

- Follow existing component and state-management conventions.
- Use reusable components for repeated design patterns.
- Keep business logic out of presentation components where practical.
- Handle loading, empty, success, error and offline states.
- Make security state understandable without misleading icons or labels.
- Do not present a message as encrypted or verified unless the underlying state supports that claim.
- Preserve responsive behavior and keyboard accessibility.
- Support English, Bengali and Arabic/RTL according to the approved localization scope.

### API rules

- Validate request parameters, query values and bodies.
- Apply authentication and authorization consistently.
- Return predictable error formats without leaking implementation details.
- Add rate limiting where abuse or resource exhaustion is plausible.
- Design retries and idempotency explicitly for operations that may be repeated.
- Keep application API endpoints separate from protocol-native Matrix operations.

### Database rules

- Use strict schemas and appropriate indexes.
- Enforce uniqueness in the database when uniqueness is required.
- Plan migrations and backfills before schema changes.
- Consider existing production data before removing or renaming fields.
- Never assume a destructive database operation is safe merely because the local development database is disposable.
- Document retention and deletion behavior.

---

## 8. Testing Requirements

Tests must verify behavior and security properties, not merely code execution.

### Unit tests

Cover:

- Validation rules.
- Business logic.
- State transitions.
- Error handling.
- Utility functions.
- Permission and privacy decisions.

### Integration tests

Cover:

- API authentication and authorization.
- Database constraints.
- Matrix integration boundaries.
- Session lifecycle.
- Blocking and reporting.
- Idempotent operations.
- Account-deletion workflow.

### End-to-end tests

Cover:

- Registration and sign-in.
- Device setup and verification.
- Encrypted message exchange.
- Offline and reconnect behavior.
- Session expiration and revocation.
- Privacy settings and blocking.
- Report submission.
- Account deletion.

### Security regression tests

At minimum, test that:

- Unauthorized users cannot access protected data.
- Application logs do not expose secrets.
- The homeserver does not receive ordinary direct-message plaintext when the approved encrypted flow is used.
- Device-verification state is handled correctly.
- Plaintext fallback cannot occur silently.
- Retrying an operation does not create unintended duplicate effects.
- Account deletion behaves safely after partial failure.

Do not use real user credentials, production private keys or sensitive production data in tests.

---

## 9. Git and Commit Rules

Use Conventional Commits.

Examples:

- `docs(architecture): document Matrix integration`
- `chore(repo): configure linting and CI`
- `feat(auth): add device verification flow`
- `feat(messaging): implement encrypted direct messages`
- `fix(sync): prevent duplicate processing on reconnect`
- `test(security): cover device revocation`
- `docs(api): document report submission endpoint`

### Commit discipline

- Make logically cohesive changes.
- Keep generated files and dependency lockfiles consistent with the repository's package manager.
- Do not commit secrets, credentials, personal data or local environment files.
- Do not rewrite shared history without explicit authorization.
- Do not use destructive Git commands to discard existing work.
- Do not create a commit unless the owner or workflow authorizes committing.
- If committing is authorized, run the required checks first and report the exact commit hash.

If the repository contains unrelated user changes, preserve them and keep your work isolated.

---

## 10. Dependency and Tool Use

Before adding a dependency:

1. Check whether the project already has a suitable library.
2. Verify compatibility with the current runtime and SDK versions.
3. Review maintenance, licensing and known vulnerabilities.
4. Explain why the dependency is needed.
5. Add it using the existing package manager.
6. Update the lockfile.
7. Run relevant tests and builds.

Do not:

- Invent APIs, package names, CLI flags or configuration options.
- Claim a library supports encryption or a platform without verifying it.
- Replace working libraries merely because another option is more fashionable.
- Upgrade major dependencies as unrelated cleanup.
- disable security checks to bypass installation or CI problems.

When external documentation is needed, prefer official documentation and release notes.

---

## 11. Configuration and Environment Management

- Keep credentials out of source control.
- Provide a safe `.env.example` containing placeholders only.
- Validate required configuration at startup.
- Separate development, test, staging and production environments.
- Use the documented secret-management system for deployed environments.
- Avoid hard-coded service URLs and secrets.
- Document configuration changes and deployment implications.
- Never print environment variables or secret values to debug a failure.

When a required credential is unavailable, report the blocker and continue only with independent work that does not require it.

---

## 12. AI Honesty and Reporting

AI agents must distinguish between implementation, testing and verification.

Use these status labels accurately:

- **Implemented:** the code change has been made.
- **Tested:** the relevant test was actually executed.
- **Verified:** the stated behavior was confirmed through the appropriate test or manual procedure.
- **Blocked:** a dependency, access limitation or unresolved decision prevents completion.
- **Deferred:** the work is intentionally postponed and recorded.
- **Complete:** all applicable acceptance criteria and required checks have passed.

Never:

- Claim a build succeeded without running it.
- Claim a manual test passed when it was not performed.
- Claim a security property based only on a UI indicator.
- Claim deployment succeeded without verifying the deployed result.
- Hide failing tests, skipped checks or known limitations.
- Invent repository files, commits, logs, test results or architecture decisions.

If tooling is unavailable, state exactly what remains unverified and give the project owner the steps needed to verify it.

---

## 13. Scope Control and Clarification

Proceed without unnecessary questions when the task is clear, low risk and reversible.

Ask the project owner before proceeding when a decision would materially affect:

- The encryption protocol or trust model.
- Account identity and key recovery.
- Database ownership or destructive migrations.
- Authentication or authorization guarantees.
- Data retention or account deletion.
- Licensing or a major technology choice.
- Public API compatibility.
- Release scope or an approved phase boundary.

If a request conflicts with a security requirement, explain the conflict and propose a safer alternative.

Do not silently expand the task into unrelated refactoring or future features.

---

## 14. Destructive and High-Risk Operations

Explicit approval is required before executing an operation that may:

- Delete or irreversibly modify user data.
- Drop databases, collections or production resources.
- Remove backups or encryption recovery material.
- Rotate or revoke production credentials or keys.
- Force-push or rewrite shared Git history.
- Deploy a breaking or potentially destructive production migration.
- Disable authentication, authorization, encryption or security controls.

Before an approved high-risk operation, explain the target, expected effect, backup or recovery plan, and rollback limitations.

A request to implement a feature is not automatically authorization to execute a destructive production action.

---

## 15. Documentation and Project Memory

Update the relevant documentation when a change alters:

- Architecture or trust boundaries.
- API contracts.
- Database schema or migrations.
- User-facing behavior.
- Configuration or setup.
- Security assumptions.
- Testing procedures.
- Deployment, recovery or operational procedures.

Keep `docs/STATUS.md` current with:

```md
# Project Status

## Active phase
Phase N — Name

## Last completed milestone
Description and verification evidence.

## Current task
The task being implemented.

## Completed
- Verified deliverables.

## Verification
- Commands executed and outcomes.
- Manual checks performed.

## Blockers and risks
- Unresolved issues and their impact.

## Deferred
- Explicitly postponed work.

## Next approved action
One concrete next task.

## Last updated
YYYY-MM-DD
```

The status document records progress; it does not override failed tests or missing acceptance criteria.

---

## 16. Standard Completion Report

At the end of every meaningful task, provide:

### Summary
What was implemented and why.

### Files changed
The important files and their purpose.

### Verification
Commands executed, test results and any skipped checks.

### Security and compatibility
Relevant risks, safeguards and limitations.

### Manual steps
Any required configuration, migration, device testing or deployment action.

### Commit
The proposed Conventional Commit message or actual commit hash, if a commit was authorized and created.

### Phase status
Whether the current task is complete, blocked or deferred, and whether the phase exit gate is satisfied.

### Next step
One recommended next action within the approved phase. Do not start it automatically.

---

## 17. Final Operating Principle

**Preserve security. Respect architecture. Make small changes. Test actual behavior. Document the truth. Protect existing work. Stop at the gate.**

When speed conflicts with security or correctness, choose security and correctness.

When a requirement is ambiguous and the consequences are significant, ask before deciding.

When a test fails, investigate and report it rather than concealing it.

When a phase is complete, present the evidence and wait for approval before moving forward.
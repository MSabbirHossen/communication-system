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

Expected: 5 files, 16 tests pass and 2 are skipped (the expiry and soft-logout tests run only when `ACCESS_TOKEN_LIFETIME_MS` is set; CI sets it to `10000` after shortening `refreshable_access_token_lifetime` to `10s` in the generated `homeserver.yaml`; to run them locally, set the same value in `infrastructure/synapse/data/homeserver.yaml`, restart Synapse, and restore `5m` afterwards). The messaging run writes `apps/web/test/integration/last-run.json`; pass it to the inspector with `--nonce-file` to confirm the server holds ciphertext only for that room.

Manual two-device check in one browser (each hostname has its own storage, so it acts as a separate device):

1. Start `pnpm dev`. Open http://localhost:5173 and create an account (lowercase username, 8+ character password). The setup screen creates the account's identity and shows the recovery key once; copy it, tick the confirmation and continue. Settings → Devices & security shows one device, **Verified**, with its key fingerprint.
2. Open http://second.localhost:5173 and sign in with the same account. The setup screen asks for the recovery key. Choose **I don't have it — verify from another device**, then **Continue**. Back on the first origin, a "new device signed in" notice appears; **Refresh list** shows the second device as **Not verified**.
3. On the first origin click **Verify** next to the second device. On the second origin a "wants to verify" notice appears: **Review** → **Continue**. Both pages show the same seven emoji in the same order. Click **They match** on both; both report "Device verified" and both device lists show both devices Verified.
4. On the first origin click **Sign out device** for the second device, confirm, and enter the password. The second origin drops to the sign-in screen with "Your session has expired"; in its DevTools → Application → IndexedDB only an empty `cs-session` database remains.
5. Reload the first origin: the session is restored without signing in again. Sign in on the second origin with a wrong password: the message is "Sign-in failed. Check your username and password." (the same for an unknown user). Sign in again with the right password and enter the recovery key this time: "Your identity and encrypted history were restored on this device" and the device is Verified without an emoji comparison.

## 9. Phase 3: encrypted one-to-one messaging checks

Two accounts in one browser, one per hostname (each has its own storage):

1. On http://localhost:5173 create account A; on http://second.localhost:5173 create account B. Each shows its recovery key once; acknowledge it.
2. On A: **People** → enter B's username → **Look up** → B's display name and identifier appear with the note that a name is not proof of identity → **Start encrypted conversation**. The conversation opens with the **Encrypted** badge, an **Unverified devices** warning, and the composer.
3. On B: Chats shows an **Invitation** from A with Accept / Decline. Accept. Send a message each way: it shows **Sending…** then **Sent**; the other side shows it under a date separator. Enter sends, Shift+Enter adds a line.
4. Offline: stop Synapse (`docker compose -f infrastructure/docker-compose.yml stop synapse`), send a message on A: it stays **Sending…** (or becomes **Not sent** with Retry / Delete after the SDK gives up). Start Synapse again: the message becomes **Sent** and B receives exactly one copy. A sync-error banner with **Retry now** appears on the list while the server is down.
5. On A: **Details** → B's identity is **Identity not verified**, the conversation is **Encrypted**, and B's devices are listed with fingerprints and **Not verified**. **Verify this person** → on B a notice "Someone wants to verify their identity with you" → **Review** → **Continue** → both show the same emoji → **They match** on both → A's header shows **Identity verified** and B's device shows **Verified** in details.
6. On B sign in on a third hostname (e.g. http://third.localhost:5173) without the recovery key: earlier messages show **Unable to decrypt** with the reason, new messages from A decrypt; A's header shows **Unverified devices** again.
7. **Leave conversation** on B after confirmation: B's list no longer shows it.
8. Invalid identifiers (`Bad Name!`, your own id) are rejected without a request; an unknown username reports "No account was found for".

## 10. Phase 4: web experience checks and end-to-end tests

Service-layer tests for profile and devices, privacy settings and blocking run with the Phase 2/3 suite (`pnpm test:integration`, §8): expect 7 files to pass and 1 to be skipped, 20 tests pass and 2 skipped, without `ACCESS_TOKEN_LIFETIME_MS` (the expiry file runs only with it).

End-to-end suite (Playwright, Chromium, axe) against the production build served by `vite preview` and your local Synapse:

```bash
pnpm --filter @cs/web exec playwright install chromium
```

```bash
pnpm test:e2e
```

Expected: 4 tests pass in about five minutes (two-user journey; revoked-device session; accessibility and viewports, public and signed-in). Each visited screen is checked with axe: serious and critical findings fail, moderate and minor ones are printed as `axe <screen>: recorded …` and attached. Screenshots at 360×740, 768×1024, 1024×768 and 1440×900, traces for failures and axe reports land in `apps/web/e2e-results` (`pnpm --filter @cs/web exec playwright show-trace <trace.zip>` opens a trace). The suite registers throwaway accounts (`e2e-alice-…`, `e2e-bob-…`, `e2e-carol-…`, `e2e-dana-…`) on the homeserver; `pnpm dev:env:reset` removes them.

Manual two-account check in one browser (one account per hostname):

1. On http://localhost:5173 and http://second.localhost:5173 create accounts A and B and start a conversation (§9 steps 1 to 3).
2. **Settings** on A: the hub lists Profile, Privacy & notifications, Blocked users, Devices & security, Privacy notes, theme and language. **Profile**: change the display name → "Display name saved." → B's conversation list shows the new name after the next sync.
3. **Privacy & notifications** on both: **Share read receipts** is off by default. Turn it on for B, then open the conversation on B after A sent a message: A sees "Read by B" under that message. With it off, A sees nothing. **Share whether I am online** off on B: A's conversation details show B as offline. The notification text choice and the browser permission row ("Browser permission: not asked yet" → **Allow browser notifications** → "allowed") are separate controls.
4. Notifications: with the permission allowed on A, switch to another tab and send from B: a notification "New message" (or "New message from B" when chosen) appears without the text; clicking it opens the conversation. In front, nothing is shown.
5. Blocking: on A, **Details** → **Block this person** → the confirmation explains the effect → the conversation shows "You blocked this person" and a banner; **Settings → Blocked users** lists B. Send from B: A does not receive it. **Unblock** → new messages from B arrive again (the one sent while blocked may appear too, as the server re-syncs the room).
6. One tab per device: open http://localhost:5173 in a second tab: "Already open in another tab" with **Use this tab**. Click it: the second tab shows Chats and the first shows the message instead. Close the second tab and click **Use this tab** in the first.
7. **Devices & security** on a second device of A (http://third.localhost:5173, restored with the recovery key): **Sign out all other devices** → confirmation → password → "1 other device(s) signed out."; the first device drops to sign-in with "Your session has expired. Sign in again."
8. Keyboard: Tab from the page start reaches **Skip to content** first; Enter moves focus into the content; after following a settings row the new screen's heading has focus; Escape closes a dialog and returns focus to the button that opened it.
9. Right-to-left: **Settings → Language → العربية** flips the layout (`dir="rtl"`); navigation, settings rows and the conversation (message bubbles, composer) stay usable; **English** restores it. The choice is not persisted across a reload yet.
10. Responsive: resize to 360, 768, 1024 and 1440 pixels wide (DevTools device toolbar): no horizontal scrolling, bottom navigation below 1024 and the rail from 1024, the conversation list and conversation side by side from 1024.

### Cross-browser record

| Browser | Version | Platform | Checked by | Date | Result |
|---|---|---|---|---|---|
| Chromium (Playwright, headless shell) | 156.0.8078.4 | Windows 11, CI Ubuntu | AI contributor | 2026-10-24 | e2e suite (see STATUS) |
| Chromium (Claude desktop built-in browser) | — | Windows 11 | AI contributor | 2026-10-24 | manual steps above (see STATUS) |
| Chrome | — | Windows | owner | — | pending |
| Edge | — | Windows | owner | — | pending |
| Android Chrome | — | Android | owner | — | pending |
| Firefox | — | — | — | — | not verified (no access) |
| Safari / iOS Safari | — | — | — | — | not verified (no access) |

## 11. Phase 5: mobile builds, the device spike and the phone checklist

The development machine has no Android SDK or Xcode: native builds run in GitHub Actions (`.github/workflows/mobile.yml`). Locally you can build the web client and sync the native projects:

```bash
CS_MOBILE_VARIANT=debug pnpm --filter @cs/mobile build:web
```

Push plumbing locally: the compose environment now includes the push gateway stub (`curl http://localhost:8010/health`); `pnpm test:integration` includes the content-free pusher test (an existing `synapse/data/homeserver.yaml` needs the `ip_range_whitelist` lines from `infrastructure/synapse/dev-overrides.yaml` appended, then `docker compose … restart synapse`).

### Spike in a browser (same runner code)

```bash
VITE_MOBILE_SPIKE=1 pnpm --filter @cs/web build && pnpm --filter @cs/web preview
```

Open http://localhost:4173: phase 1 prints `CS_SPIKE … PASS` lines and the throwaway account id. In another terminal run the peer with that id:

```bash
SPIKE_PEER_USER=@spike-web-xxxx:localhost HOMESERVER_URL=http://localhost:8008 npx vitest run --project mobile-spike
```

When the page shows `phase1 DONE`, reload it: phase 2 verifies restore, persisted history, revocation and cleanup. Expected: 13 of 13 checks PASS (Chromium, 2026-10-24).

### Android: sideload and run on your phone

1. Run the **Mobile** workflow manually (Actions → Mobile → Run workflow) with `homeserver_url` set to your PC's address as the phone sees it, e.g. `http://192.168.1.20:8008` (same Wi-Fi; allow inbound 8008 in Windows Firewall for the Docker-published port). Download the `android-apks` artifact.
2. **Spike APK** (`communication-system-spike.apk`): install it (allow installs from this source), open it, and read the on-screen lines. When it shows `CS_SPIKE account @spike-android-…`, start a conversation with that id from the web client (People → the id → Start) and send any message: the phone shows `encrypt_decrypt PASS` and replies "pong …" (visible in the web client). Then force-stop the app (Settings → Apps) and open it again: phase 2 should end with `phase2 DONE` and all checks PASS. Photograph or copy the lines into the record below.
3. **Debug APK** (`communication-system-debug.apk`): the real app. Checklist: create an account (recovery key shown once); from the web client start a conversation with it and exchange messages both ways; verify the phone's device from the web client (emoji); background the app and return (messages continue); turn on airplane mode, send a message (Sending…), turn it off (Sent, received on web); force-stop and reopen (still signed in, history present); from the web client's Devices & security sign out the phone's device: the phone drops to sign-in with "Your session has expired"; the back button returns to the previous screen and minimises at the root.

### iOS

Built and run on the iOS simulator in CI only (`ios-spike-evidence` artifact). A real iPhone needs a Mac with Xcode 26 and an Apple developer account: **Blocked** for now.

### Device record

| Platform | Device / OS / WebView | Checked by | Date | Spike | Checklist |
|---|---|---|---|---|---|
| Chromium (browser) | Windows 11, Chrome 152 | AI contributor | 2026-10-24 | 13/13 PASS | n/a |
| Android emulator | API 34 x86_64, System WebView Chrome 113 | CI | 2026-10-25 | 13/13 PASS (Mobile run #7) | n/a |
| Android phone | — | owner | — | pending | pending |
| iOS simulator | macOS 26 runner, Xcode 26, iOS 18.7 | CI | 2026-10-25 | 13/13 PASS (Mobile run #7) | n/a |
| iPhone | — | — | — | Blocked | Blocked |

## 12. Reset everything

```bash
pnpm dev:env:reset
```

Deletes Synapse data and the MongoDB volume, then re-initialises.

## 13. Environment boundaries

| `NODE_ENV` / `VITE_APP_ENV` | Behaviour |
|---|---|
| `development` | verbose logs with stacks; relaxed CORS default `http://localhost:5173` |
| `test` | silent logs; MongoDB database name gets a `_test` suffix |
| `production` | refuses `CORS_ORIGINS=*` and `LOG_LEVEL=debug|trace`; no stacks in logs |

Production deployment (TLS, PostgreSQL for Synapse, secret management) is documented in later phases; this compose file is for development only.

## 14. Troubleshooting

- `docker: command not found`: install Docker Desktop and reopen the terminal.
- Synapse never becomes healthy: `docker logs cs-synapse`; a wrong `UID/GID` in `infrastructure/.env` makes `/data` unwritable, rerun `pnpm dev:env:reset`.
- `Registration has been disabled` from the PoC: the overrides were not appended on a new line; rerun `pnpm dev:env:reset`.
- API exits with `Invalid environment configuration`: the message lists the variable names to fix in `apps/api/.env`.
- Android app or spike logs `Promise.withResolvers is not a function`: the device's System WebView is older than Chrome 119 and the build predates the shim in `apps/web/src/platform/polyfills.ts` (commit `7643c78`); rebuild, or update Android System WebView from the Play Store.
- iOS simulator spike fails at `secure_storage` with `An OS error occurred (-34018)`: the app was built unsigned (`CODE_SIGNING_ALLOWED=NO`); the simulator reads entitlements from the signature, so build with `CODE_SIGN_IDENTITY=- CODE_SIGNING_REQUIRED=NO` (ad hoc) as the Mobile workflow does.

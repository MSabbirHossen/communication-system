# Mobile E2EE spike — findings and recommendation

**Date:** 2026-10-20  
**Status:** Research complete; on-device test **not executed** (blocked, see §2)  
**Feeds:** ADR-0001 §5 and condition C2; STATUS risk R1; THREAT_MODEL TM-22/TM-23  
**Labels** follow AGENTS.md §12. Anything not marked *Tested* or *Verified* is **untested**.

---

## 1. Question

Can the crypto stack verified in Phase 0 (`matrix-js-sdk` 44 + `@matrix-org/matrix-sdk-crypto-wasm` 18.9, i.e. Rust `matrix-sdk-crypto` compiled to WebAssembly) run inside a React Native app on Android and iOS? If not, which mobile path should the project take?

## 2. What was and was not tested

| Step | Outcome |
|---|---|
| Minimal React Native app on an Android emulator calling `initRustCrypto()` and decrypting a message | **Blocked — not run.** The machine has no JDK, no Android SDK, no emulator, no `adb`, no Android Studio (`JAVA_HOME`/`ANDROID_HOME` unset; `java`, `adb`, `emulator`, `sdkmanager` all missing). Installing them needs ~3 GB over a link that was failing TLS revocation checks during this session (`curl: CRYPT_E_REVOCATION_OFFLINE`), and emulator acceleration (WHPX/Hyper-V) needs an elevated shell. See §6 for the exact prerequisites. |
| Engine-level test of the wasm crypto module under a desktop Hermes CLI | **Not run.** The only published desktop Hermes CLI releases are v0.13.0 (2024) and older; they predate WebAssembly support, so a pass/fail would say nothing about current Hermes. The WebAssembly-capable Hermes is only available by building from source. |
| Static analysis of what the wasm crypto glue needs from the JS engine | **Tested** (grep of the installed package, see §3.1). |
| Official documentation and release notes review | **Done**, sources in §7. |

## 3. Findings

### 3.1 What the crypto package needs from the JavaScript engine (Tested: static inspection of `@matrix-org/matrix-sdk-crypto-wasm` 18.9.0)

- Browser entry (`index.mjs`): `WebAssembly.instantiateStreaming` over `fetch()` of the 8.5 MB `.wasm` file.
- Node entry (`node.mjs`): `fs.readFile` then `WebAssembly.Module` / `WebAssembly.Instance` / `WebAssembly.instantiate`.
- A wasm-bindgen generated glue; earlier field reports (matrix-js-sdk issue #4147, 2024) show it referencing `FinalizationRegistry` at load time.
- There is **no React Native entry point** and no `react-native` field in `package.json`; Metro would pick the browser entry, whose `fetch(new URL(..., import.meta.url))` pattern has no equivalent in a Metro bundle.

### 3.2 Hermes (React Native's engine) — from official sources

| Fact | Source | Label |
|---|---|---|
| React Native 0.84 (Feb 2026) made **Hermes V1** the default engine on iOS and Android; the release post does **not** mention WebAssembly. | reactnative.dev 0.84 post | Verified (doc) |
| The Hermes stable-release note for 260318099.0.0 lists **`FinalizationRegistry`** and `WeakRef`/`WeakMap`/`WeakSet` accepting symbols as newly supported. The 2024 `FinalizationRegistry` blocker is therefore gone in current Hermes. | facebook/hermes `doc/blog/2026-06-05-new-hermes-stable-release.md` | Verified (doc) |
| **WebAssembly in Hermes is "an early preview"** and "not yet ready for production use." Examples run with `hermes -Xhermes-internal-test-methods` and the build instructions are a from-source macOS build. Supported: core Wasm 1.0, linear memory, tables, globals, imports/exports, exception handling, bulk memory, `i64` via 32-bit pairs, AOT to `.hbc`. Not supported: SIMD, threads/shared memory, performance optimisations, native `i64`. | Hermes maintainer T. Mikov, "WebAssembly Comes to Hermes", 17 Feb 2026 | Verified (doc) |
| The `reactnative.dev/docs/hermes` page and Expo SDK 55 changelog do not mention WebAssembly. Expo SDK 55 says Hermes V1 "requires building React Native from source" and warns of "known memory and development startup regressions"; Expo SDK 58 (current) ships RN 0.88. | reactnative.dev, expo.dev | Verified (doc) |
| `matrix-js-sdk` README lists Node.js and browsers as supported hosts; React Native is not mentioned. The Rust/wasm backend is "the only supported backend for new integrations." | matrix-js-sdk README, encryption guide | Verified (doc) |

**Conclusion for React Native + matrix-js-sdk:** not viable for a product today. Even where Hermes has WebAssembly, it is an unshipped preview behind an internal flag with no performance work, and neither the SDK nor the wasm package targets React Native. This is a finding from official sources, **not** an on-device test result.

### 3.3 The upstream-supported mobile path — matrix-rust-sdk bindings

| Fact | Source | Label |
|---|---|---|
| `matrix-rust-sdk/bindings/` contains `apple`, `matrix-sdk-ffi`, `matrix-sdk-ffi-macros`, `matrix-sdk-crypto-ffi` (UniFFI → Kotlin/Swift). No React Native binding. JS bindings are the separate `matrix-sdk-crypto-wasm` / `matrix-sdk-crypto-nodejs` repos. | GitHub tree | Verified (doc) |
| Kotlin: `org.matrix.rustcomponents:sdk-android` on Maven Central, latest **26.10.20** (published the day of this spike), Apache-2.0, "Android Bindings to the Matrix Rust SDK". A separate `crypto-android` artifact exposes only the crypto state machine. | Maven Central | Verified (doc) |
| Swift: `matrix-rust-components-swift` Swift package, Apache-2.0, "The Swift components for the Rust SDK are unstable meaning that the API could change at any point." | GitHub README | Verified (doc) |
| These are what Element X (Android and iOS) is built on. | Element public docs | Verified (doc) |

### 3.4 Capacitor / WebView wrapper

| Fact | Source | Label |
|---|---|---|
| Capacitor runs the web app in the platform WebView (WKWebView on iOS, Android System WebView). Its security guide says sensitive values should be kept in memory or in native secure storage (Keychain / Keystore via a plugin), and it does not discuss WebAssembly or IndexedDB availability. | capacitorjs.com security guide | Verified (doc) |
| WKWebView and Android System WebView (Chromium) support WebAssembly and IndexedDB as ordinary browser features. | general browser platform knowledge | **Untested** here |
| Push notifications on mobile run outside the WebView and cannot reach the WebView's IndexedDB crypto store, so they cannot decrypt content; one Capacitor-based Matrix client documents exactly this and found "no seam for a native OlmMachine in matrix-js-sdk." | trinity-matrix-client issue #1153 / PR #1202 (third-party) | Verified (doc, third-party) |

Note that the PRD already requires generic, content-free push notifications (FR-09), so the push limitation matches the product's own rule rather than contradicting it.

## 4. Comparison

Effort is relative to a solo developer who has already built the web client. "Risk" is delivery risk, "Security" is key-storage and code-surface posture.

| Option | Security | Effort | Risk | Maintenance | Licensing | Verdict |
|---|---|---|---|---|---|---|
| **A. React Native + matrix-js-sdk (wasm crypto in Hermes)** | Same vetted crypto, but on an engine path the SDK does not support | Unknown; blocked on Hermes | **Very high** — Wasm is a preview behind an internal flag, no RN entry in the SDK | Would depend on unreleased engine work | Apache-2.0 | **Not viable now** |
| **B. React Native UI + native modules bridging matrix-rust-sdk (Kotlin/Swift bindings)** | Strong: keys in the Rust SDK's store, Keystore/Keychain-backed secrets possible | **High**: project writes and maintains a JS↔native bridge over a large API the Swift side calls unstable; two platforms of glue | High | High (bridge tracks two moving APIs) | Apache-2.0 | Possible later, not for MVP |
| **C. Native Kotlin + Swift apps on matrix-rust-sdk (Element X model)** | **Strongest**, upstream-supported | **Highest**: two native UIs, two languages, no code shared with web | Medium (proven path) | Medium (upstream maintained) | Apache-2.0 | Right answer with a mobile team; too much for a solo MVP |
| **D. Capacitor wrapper around the web client** | Same verified crypto stack; keys in WebView IndexedDB inside the app sandbox (OS file encryption, no hardware-backed key protection); web XSS surface applies; push cannot decrypt (acceptable per FR-09) | **Low**: one codebase, native shell, store distribution; a few plugins (push token, secure storage for the recovery key, app lock) | Medium: WebView wasm/IndexedDB behaviour on devices **untested** here | Low (web client is the product) | MIT (Capacitor), Apache-2.0 (SDK) | **Recommended for MVP** |
| **E. Web-first, mobile deferred (installable PWA)** | Same as web | Lowest | Lowest technically; **contradicts PRD §6.1 item 17** (Android/iOS in first release) | Lowest | — | Fallback if D fails its device spike; needs owner scope change |

## 5. Recommendation (one)

**Ship the MVP mobile apps as a Capacitor wrapper around the verified web client (option D), and drop React Native from the stack.** Reasons:

1. It reuses the exact crypto stack Phase 0 verified, so the encryption claims made to users rest on tested code, not on a second implementation.
2. It is the only option a solo developer can deliver inside the 16–24 week plan without writing security-sensitive bridge code (B) or two native UIs (C).
3. Its main functional limitation, no decryption in push handlers, is already the product rule (generic notifications by default).
4. Its main security limitation, WebView-resident keys without hardware backing, is the same posture as the web client and is already an accepted, disclosed item in the threat model (TM-11); it must be stated in the privacy disclosure.
5. It keeps option C open: if the beta shows mobile needs hardware-backed keys or background decryption, native apps on matrix-rust-sdk can replace the wrapper without changing the server or the web client.

**Conditions:** (i) a Phase 5 device spike must show `initRustCrypto()` and message decryption working in WKWebView (iOS) and Android System WebView on real devices, since that was not tested here; (ii) the recovery key and session token go to native secure storage via a Capacitor plugin, never `localStorage`; (iii) a strict CSP and no third-party scripts in the wrapped bundle; (iv) the PRD §12 mobile row changes from "React Native, Expo where compatible" to "Capacitor wrapper of the web client", which is a scope change for the owner to approve.

**Not recommended:** React Native + matrix-js-sdk (A) until Hermes ships WebAssembly as a supported, enabled-by-default feature and matrix-js-sdk documents React Native support. Re-check at each React Native minor release.

## 6. What is needed to run the real Android test on this machine

If the owner wants the on-device React Native test anyway (to record the exact failure rather than rely on documentation):

1. Install a JDK 17 and Android Studio with SDK Platform 35, Build-Tools, Platform-Tools and an x86_64 system image (about 3 GB), and set `JAVA_HOME` and `ANDROID_HOME`.
2. Enable Windows Hypervisor Platform (elevated PowerShell: `Enable-WindowsOptionalFeature -Online -FeatureName HypervisorPlatform`, then reboot) so the emulator can run.
3. Create an AVD and start it.
4. Then run (from the repo): `npx @react-native-community/cli init MatrixSpike --version 0.88`, add `matrix-js-sdk@44`, and an `App.tsx` that calls `createClient(...).initRustCrypto({ useIndexedDB: false })` against the Synapse used for the Phase 0 PoC; expected first failures are at bundle time (no React Native entry for the wasm package) before any runtime check.

Alternatively, this test can run in GitHub Actions on an `ubuntu-latest` runner with `reactivecircus/android-emulator-runner` once the repository is pushed; that avoids the local toolchain entirely but still needs a push.

## 7. Sources (all fetched 2026-10-20)

- React Native 0.84 release post — https://reactnative.dev/blog/2026/02/11/react-native-0.84
- React Native Hermes docs — https://reactnative.dev/docs/hermes
- Hermes stable release note 260318099.0.0 — https://github.com/facebook/hermes/blob/static_h/doc/blog/2026-06-05-new-hermes-stable-release.md
- T. Mikov, "WebAssembly Comes to Hermes", 17 Feb 2026 — https://tmikov.blogspot.com/2026/02/webassembly-comes-to-hermes_01829874520.html
- Expo SDK 55 changelog — https://expo.dev/changelog/sdk-55 ; Expo SDK reference (SDK 58 / RN 0.88) — https://docs.expo.dev/versions/latest/
- matrix-js-sdk README — https://github.com/matrix-org/matrix-js-sdk/blob/develop/README.md ; encryption guide — https://matrix-org-matrix-js-sdk.mintlify.app/guides/encryption-overview ; issue #4147 — https://github.com/matrix-org/matrix-js-sdk/issues/4147
- matrix-sdk-crypto-wasm README — https://github.com/matrix-org/matrix-sdk-crypto-wasm/blob/main/README.md
- matrix-rust-sdk bindings — https://github.com/matrix-org/matrix-rust-sdk/tree/main/bindings
- matrix-rust-components-kotlin — https://github.com/matrix-org/matrix-rust-components-kotlin ; Maven `org.matrix.rustcomponents:sdk-android` — https://central.sonatype.com/artifact/org.matrix.rustcomponents/sdk-android
- matrix-rust-components-swift — https://github.com/matrix-org/matrix-rust-components-swift
- Capacitor security guide — https://capacitorjs.com/docs/guides/security
- trinity-matrix-client issue #1153 and PR #1202 (third-party Capacitor Matrix client; push/crypto-store limitation) — https://github.com/quwisky/trinity-matrix-client/issues/1153

import type { CapacitorConfig } from "@capacitor/cli";

// Capacitor shell around the web client (ADR-0001 C2, ADR-0006).
//
// Variants (CS_MOBILE_VARIANT, default "release"):
// - release: the bundle is served from https://localhost (a secure context, so WebAssembly,
//   IndexedDB and crypto.subtle work); the homeserver baked into the web build must be https.
// - debug: Android serves the bundle from http://localhost so a debug or spike build can
//   talk to a plain-http development homeserver (the emulator's 10.0.2.2:8008 or a PC on the
//   LAN) without mixed content; the debug build type also allows cleartext traffic
//   (android/app/src/debug/AndroidManifest.xml). iOS cannot use http or https as its scheme
//   (WKWebView owns them), so it keeps the default `capacitor://localhost` origin and relies on
//   NSAllowsLocalNetworking in Info.plist for a local development homeserver.
const variant = process.env.CS_MOBILE_VARIANT === "debug" ? "debug" : "release";

const config: CapacitorConfig = {
  appId: "org.communicationsystem.app",
  appName: "Communication System",
  webDir: "../web/dist",
  server: {
    hostname: "localhost",
    androidScheme: variant === "debug" ? "http" : "https",
    cleartext: variant === "debug",
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;

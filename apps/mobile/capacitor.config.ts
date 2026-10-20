import type { CapacitorConfig } from "@capacitor/cli";

// Capacitor shell around the web client (ADR-0001 C2, provisional).
// Native platform folders (android/, ios/) are NOT added in Phase 1; they are
// created by `pnpm cap add <platform>` during the Phase 5 device spike.
const config: CapacitorConfig = {
  appId: "org.communicationsystem.app",
  appName: "Communication System",
  webDir: "../web/dist",
  server: {
    // Serve the bundle from an https origin on Android so WebAssembly, IndexedDB
    // and secure-context APIs behave as in the browser.
    androidScheme: "https",
    iosScheme: "https",
  },
};

export default config;

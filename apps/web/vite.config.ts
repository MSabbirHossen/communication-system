/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { applyConnectSources, connectSources } from "./src/config/csp";

/** Fill the CSP connect-src in index.html from the configured homeserver and API origins. */
function cspConnectSrc(mode: string, command: "serve" | "build"): Plugin {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const sources = connectSources(env, command);
  return {
    name: "cs-csp-connect-src",
    transformIndexHtml: (html) => applyConnectSources(html, sources),
  };
}

export default defineConfig(({ mode, command }) => ({
  plugins: [react(), cspConnectSrc(mode, command)],
  // The Rust crypto WebAssembly package must not be pre-bundled: it loads its .wasm
  // relative to its own module URL.
  optimizeDeps: { exclude: ["@matrix-org/matrix-sdk-crypto-wasm"] },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173 },
  build: { sourcemap: true, target: "es2022" },
  test: {
    name: "web",
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
  },
}));

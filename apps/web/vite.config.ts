/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
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
});

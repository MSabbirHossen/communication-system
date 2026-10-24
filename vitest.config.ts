import { defineConfig } from "vitest/config";

// One Vitest run for the whole workspace. Each app/package carries its own
// vitest.config.ts (environment, setup files); the PoC is an inline project.
export default defineConfig({
  test: {
    projects: [
      "apps/*",
      "packages/*",
      {
        test: {
          name: "poc",
          include: ["poc/**/*.test.mjs"],
          environment: "node",
        },
      },
      // Peer for the on-device spike (ADR-0006): runs only with SPIKE_PEER_USER and
      // HOMESERVER_URL set by the mobile CI jobs; skipped otherwise.
      {
        test: {
          name: "mobile-spike",
          include: ["apps/web/test/spike/**/*.test.ts"],
          environment: "node",
          testTimeout: 300_000,
          hookTimeout: 120_000,
        },
      },
      // Phase 2 service-layer tests against a real homeserver (skipped unless
      // HOMESERVER_URL is set): `pnpm test:integration` with the compose Synapse running.
      {
        test: {
          name: "web-integration",
          include: ["apps/web/test/integration/**/*.test.ts"],
          environment: "node",
          testTimeout: 120_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});

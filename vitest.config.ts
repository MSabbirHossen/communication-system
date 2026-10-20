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
    ],
  },
});

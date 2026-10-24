import { defineConfig, devices } from "@playwright/test";

// End-to-end suite (Phase 4): the production build served by `vite preview`, against the
// compose Synapse (http://localhost:8008, the client's default). `pnpm test:e2e` builds first.
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e-results",
  fullyParallel: false,
  workers: 1,
  retries: isCI ? 1 : 0,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: isCI ? [["list"], ["html", { open: "never", outputFolder: "e2e-report" }]] : [["list"]],
  use: {
    baseURL: "http://localhost:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !isCI,
    timeout: 60_000,
  },
});

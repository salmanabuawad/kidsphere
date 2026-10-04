import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against a dedicated database (ks_e2e) that is wiped and
 * re-seeded by tests/e2e/global-setup.ts, and a dev server on port 3100.
 */
const E2E_DB = process.env.E2E_DATABASE_URL ?? "postgresql://kidsphere:kidsphere@localhost:5433/ks_e2e";
const PORT = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1280, height: 900 },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } }],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
    env: {
      DATABASE_URL: E2E_DB,
      AI_DEFAULT_PROVIDER: "demo",
      ANTHROPIC_API_KEY: "",
      OPENAI_API_KEY: "",
      STORAGE_LOCAL_DIR: ".data/e2e-storage",
      NEXT_DIST_DIR: ".next-e2e",
    },
  },
});

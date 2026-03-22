import { defineConfig, devices } from "@playwright/test";

/**
 * Local/CI Playwright config — runs shell E2E tests against localhost.
 *
 * This config runs ONLY the shell tests (page renders, redirects, analytics)
 * that do NOT require Firebase Auth or a real backend. These tests use fake
 * Firebase config and verify the frontend renders correctly.
 *
 * For authenticated user flow tests (E-AUTH-003, E-DASH-003, etc.) and staging
 * infrastructure smoke tests, use playwright.staging.config.ts instead:
 *   pnpm --filter @prefpilot/frontend exec playwright test --config playwright.staging.config.ts
 *
 * Excluded from this config:
 *   - auth.setup.ts (requires real Firebase credentials)
 *   - staging-smoke.spec.ts (requires live staging deployment)
 *   - Authenticated tests in auth/dashboard/audit/results/export specs run only
 *     the shell subset (tests that clear cookies or don't need storageState)
 */
export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["auth.setup.ts", "staging-smoke.spec.ts"],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 4,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: process.env.CI ? "pnpm start" : "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

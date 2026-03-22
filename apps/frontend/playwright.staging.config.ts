/**
 * Playwright config for staging E2E tests (infrastructure smoke + authenticated user flows).
 *
 * Runs against the live staging URL (https://prefpilot-stage.web.app) or localhost.
 * Uses an auth setup project to sign in once and share storageState across all
 * authenticated test specs.
 *
 * Env vars required for authenticated tests:
 *   E2E_TEST_EMAIL    — Firebase test account email
 *   E2E_TEST_PASSWORD — Firebase test account password
 *
 * Usage:
 *   # Infrastructure smoke only (no auth needed):
 *   pnpm --filter @prefpilot/frontend exec playwright test --config playwright.staging.config.ts --project=staging-smoke
 *
 *   # All tests including authenticated flows:
 *   E2E_TEST_EMAIL=test@example.com E2E_TEST_PASSWORD=secret \
 *     pnpm --filter @prefpilot/frontend exec playwright test --config playwright.staging.config.ts
 */

import { defineConfig, devices } from "@playwright/test";
import path from "path";

const STAGING_URL = process.env["E2E_BASE_URL"] ?? "https://prefpilot-stage.web.app";
const AUTH_STATE_PATH = path.join(import.meta.dirname, "e2e", ".auth", "user.json");

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "html",
  timeout: 60_000,
  use: {
    baseURL: STAGING_URL,
    trace: "on-first-retry",
  },
  projects: [
    /* --- Auth setup: sign in once, save storageState --- */
    {
      name: "auth-setup",
      testMatch: "auth.setup.ts",
      use: { ...devices["Desktop Chrome"] },
    },

    /* --- Infrastructure smoke: no auth needed --- */
    {
      name: "staging-smoke",
      testMatch: "staging-smoke.spec.ts",
      use: { ...devices["Desktop Chrome"] },
    },

    /* --- Authenticated user flows: depend on auth-setup --- */
    {
      name: "authenticated",
      testMatch: [
        "auth.spec.ts",
        "dashboard.spec.ts",
        "audit.spec.ts",
        "results.spec.ts",
        "export.spec.ts",
      ],
      dependencies: ["auth-setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: AUTH_STATE_PATH,
      },
    },
  ],
  /* No webServer — staging is already deployed. For local, start dev server first. */
});

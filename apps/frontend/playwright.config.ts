import { defineConfig, devices } from "@playwright/test";
import path from "path";
import fs from "fs";

/**
 * Local/CI Playwright config.
 *
 * Behavior depends on whether E2E_TEST_EMAIL is set:
 *
 * - WITH credentials (local dev):
 *   Runs auth.setup.ts first, then ALL E2E tests including authenticated flows.
 *   Set E2E_TEST_EMAIL + E2E_TEST_PASSWORD in .env.local or export them.
 *
 * - WITHOUT credentials (CI):
 *   Skips auth.setup.ts. Authenticated tests auto-skip via test.skip() guards.
 *   Only shell tests (page renders, redirects) run.
 *
 * Excluded always:
 *   - staging-smoke.spec.ts (requires live staging deployment, not localhost)
 *
 * For staging-specific tests, use playwright.staging.config.ts:
 *   pnpm --filter @prefpilot/frontend exec playwright test --config playwright.staging.config.ts
 */

/* Load .env.local for E2E_TEST_EMAIL/PASSWORD (Playwright doesn't auto-load Next.js env files) */
const envLocalPath = path.join(__dirname, ".env.local");
if (fs.existsSync(envLocalPath)) {
  const envContent = fs.readFileSync(envLocalPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx);
    const value = trimmed.slice(eqIdx + 1);
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

const hasCredentials = !!process.env["E2E_TEST_EMAIL"];
const AUTH_STATE_PATH = path.join(__dirname, "e2e", ".auth", "user.json");

const projects = hasCredentials
  ? [
      /* Auth setup: sign in once, save storageState */
      {
        name: "auth-setup",
        testMatch: /auth\.setup\.ts/,
        use: { ...devices["Desktop Chrome"] },
      },
      /* All tests: shell tests run directly, auth tests use storageState */
      {
        name: "chromium",
        dependencies: ["auth-setup"],
        use: {
          ...devices["Desktop Chrome"],
          storageState: AUTH_STATE_PATH,
        },
      },
    ]
  : [
      /* No credentials: only shell tests will run (auth tests auto-skip) */
      {
        name: "chromium",
        use: { ...devices["Desktop Chrome"] },
      },
    ];

export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["staging-smoke.spec.ts"],
  fullyParallel: !hasCredentials,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: hasCredentials ? 1 : process.env.CI ? 1 : 4,
  reporter: "html",
  timeout: hasCredentials ? 60_000 : 30_000,
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects,
  webServer: {
    command: process.env.CI ? "pnpm start" : "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

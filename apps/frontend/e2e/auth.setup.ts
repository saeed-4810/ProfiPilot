import { test as setup, expect } from "@playwright/test";
import path from "path";

/**
 * Playwright global setup — authenticate once, save storageState.
 *
 * Signs in via the /login page using E2E_TEST_EMAIL + E2E_TEST_PASSWORD env vars.
 * Saves the authenticated browser state (cookies including __session) to a file
 * that all authenticated test projects reuse.
 *
 * Env vars:
 *   E2E_TEST_EMAIL    — Firebase test account email
 *   E2E_TEST_PASSWORD — Firebase test account password
 *
 * On local: set in .env.local or export before running.
 * On staging CI: set via GitHub Secrets.
 */

const AUTH_STATE_PATH = path.join(__dirname, ".auth", "user.json");

setup("authenticate via login page", async ({ page }) => {
  const email = process.env["E2E_TEST_EMAIL"];
  const password = process.env["E2E_TEST_PASSWORD"];

  if (!email || !password) {
    throw new Error(
      "E2E_TEST_EMAIL and E2E_TEST_PASSWORD env vars are required for authenticated E2E tests. " +
        "Set them in .env.local or export them before running."
    );
  }

  // Navigate to login page
  await page.goto("/login");
  await expect(page.getByTestId("login-page")).toBeVisible();

  // Fill in credentials and submit
  await page.getByTestId("login-email-input").fill(email);
  await page.getByTestId("login-password-input").fill(password);
  await page.getByTestId("login-submit").click();

  // Wait for redirect to /dashboard (successful sign-in)
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

  // Verify dashboard loaded (proves __session cookie was set)
  await expect(page.getByTestId("dashboard-page")).toBeVisible({ timeout: 10_000 });

  // Save authenticated state for reuse by other test projects
  await page.context().storageState({ path: AUTH_STATE_PATH });
});

export { AUTH_STATE_PATH };

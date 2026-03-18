import { test, expect } from "@playwright/test";

/**
 * E2E scenarios for the Signup flow (PERF-124).
 *
 * E-SIGNUP-001: Active — signup page renders with form.
 * E-SIGNUP-002: Active — signup page returns HTTP 200.
 */

test.describe("Signup flow — /signup", () => {
  // E-SIGNUP-001: Signup page renders with form
  test("E-SIGNUP-001 — signup page renders with heading and form", async ({ page }) => {
    await page.goto("/signup");
    await expect(page).toHaveTitle(/PrefPilot/);
    await expect(page.getByTestId("signup-page")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Create your account/i })).toBeVisible();
    await expect(page.getByTestId("signup-email-input")).toBeVisible();
    await expect(page.getByTestId("signup-password-input")).toBeVisible();
    await expect(page.getByTestId("signup-confirm-input")).toBeVisible();
    await expect(page.getByTestId("signup-submit")).toBeVisible();
    await expect(page.getByTestId("signup-login-link")).toBeVisible();
  });

  // E-SIGNUP-002: Signup page returns 200
  test("E-SIGNUP-002 — signup page returns 200", async ({ page }) => {
    const response = await page.goto("/signup");
    expect(response?.status()).toBe(200);
  });
});

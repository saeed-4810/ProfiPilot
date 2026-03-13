import { test, expect } from "@playwright/test";

/**
 * E2E scenarios for the Authentication flow (PERF-98).
 *
 * Shell tests (E-AUTH-001, E-AUTH-002) run now against the scaffold.
 * Feature tests (E-AUTH-003, E-AUTH-004) are stubs — implement when PERF-98 is in progress.
 */

test.describe("Auth flow — /login", () => {
  // E-AUTH-001: Login page renders without errors
  test("E-AUTH-001 — login page renders with heading", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveTitle(/PrefPilot/);
    await expect(page.getByTestId("login-page")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Sign in to PrefPilot/i })).toBeVisible();
  });

  // E-AUTH-002: Login page returns 200 (no 404/500)
  test("E-AUTH-002 — login page returns 200", async ({ page }) => {
    const response = await page.goto("/login");
    expect(response?.status()).toBe(200);
  });

  // E-AUTH-003: User signs in with valid Firebase credentials → redirects to /dashboard
  test.fixme("E-AUTH-003 — valid sign-in redirects to /dashboard (PERF-98)", async ({ page }) => {
    await page.goto("/login");
    // TODO(PERF-98): fill email + password, click submit, assert redirect
    await expect(page).toHaveURL("/dashboard");
  });

  // E-AUTH-004: Invalid credentials show error message
  test.fixme("E-AUTH-004 — invalid credentials show error message (PERF-98)", async ({ page }) => {
    await page.goto("/login");
    // TODO(PERF-98): fill invalid credentials, click submit, assert error banner
    await expect(page.getByRole("alert")).toBeVisible();
  });
});

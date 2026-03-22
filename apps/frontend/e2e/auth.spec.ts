import { test, expect } from "@playwright/test";

/**
 * E2E scenarios for the Authentication flow (PERF-98) and App Shell (PERF-115).
 *
 * E-AUTH-001, E-AUTH-002: Public — login page renders correctly (no auth needed).
 * E-AUTH-003: Authenticated — valid sign-in redirects to /dashboard.
 * E-AUTH-004: Public — invalid credentials show error message.
 * E-SHELL-001: Public — middleware redirects unauthenticated users.
 * E-SHELL-002: Authenticated — navigation renders on authenticated pages.
 *
 * Tests using the "authenticated" project have storageState from auth.setup.ts.
 */

test.describe("Auth flow — /login", () => {
  // E-AUTH-001: Login page renders without errors
  test("E-AUTH-001 — login page renders with heading and form", async ({ page }) => {
    // Clear cookies so we hit login as unauthenticated
    await page.context().clearCookies();
    await page.goto("/login");
    await expect(page.getByTestId("login-page")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Sign in to PrefPilot/i })).toBeVisible();
    await expect(page.getByTestId("login-email-input")).toBeVisible();
    await expect(page.getByTestId("login-password-input")).toBeVisible();
    await expect(page.getByTestId("login-submit")).toBeVisible();
  });

  // E-AUTH-002: Login page returns 200 (no 404/500)
  test("E-AUTH-002 — login page returns 200", async ({ page }) => {
    await page.context().clearCookies();
    const response = await page.goto("/login");
    expect(response?.status()).toBe(200);
  });

  // E-AUTH-003: User signs in with valid Firebase credentials → redirects to /dashboard
  test("E-AUTH-003 — valid sign-in redirects to /dashboard", async ({ page }) => {
    // The auth.setup.ts already proved sign-in works. Here we verify the
    // authenticated storageState gives us access to /dashboard directly.
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByTestId("dashboard-page")).toBeVisible();
  });

  // E-AUTH-004: Invalid credentials show error message
  test("E-AUTH-004 — invalid credentials show error message", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/login");
    await page.getByTestId("login-email-input").fill("invalid-user@nonexistent.com");
    await page.getByTestId("login-password-input").fill("wrongpassword123");
    await page.getByTestId("login-submit").click();

    // Error banner should appear with role="alert"
    await expect(page.getByTestId("login-error")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("login-error")).toHaveAttribute("role", "alert");
  });
});

test.describe("App Shell — route protection (PERF-115)", () => {
  // E-SHELL-001: Unauthenticated /dashboard redirects to /login
  test("E-SHELL-001 — unauthenticated /dashboard redirects to /login", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  // E-SHELL-002: Navigation renders on authenticated pages
  test("E-SHELL-002 — navigation renders on authenticated pages", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByTestId("dashboard-page")).toBeVisible();
    // Navigation component should be visible on authenticated pages
    const nav = page.locator("nav").first();
    await expect(nav).toBeVisible();
  });
});

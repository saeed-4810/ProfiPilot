import { test, expect } from "@playwright/test";

/**
 * E2E scenarios for the Authentication flow (PERF-98) and App Shell (PERF-115).
 *
 * E-AUTH-001, E-AUTH-002: Active — login page renders correctly.
 * E-AUTH-003, E-AUTH-004: fixme — require Firebase test user + backend running.
 *   The login form is implemented (PERF-98), but E2E auth requires:
 *   1. A Firebase test user account in the dev project
 *   2. Backend running with POST /auth/verify-token endpoint
 *   3. Playwright auth state fixture for session cookie
 *   These will be activated when the backend auth endpoints are deployed.
 * E-SHELL-001: Active — middleware redirects unauthenticated users.
 * E-SHELL-002: fixme — requires authenticated session setup.
 */

test.describe("Auth flow — /login", () => {
  // E-AUTH-001: Login page renders without errors
  test("E-AUTH-001 — login page renders with heading and form", async ({ page }) => {
    await page.goto("/login");
    // Wait for page to fully load before assertions (CI can be slow on first load)
    await page.waitForLoadState("domcontentloaded");
    await expect(page).toHaveTitle(/PrefPilot/);
    await expect(page.getByTestId("login-page")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Sign in to PrefPilot/i })).toBeVisible();
    // PERF-98: Login form is now implemented
    await expect(page.getByTestId("login-email-input")).toBeVisible();
    await expect(page.getByTestId("login-password-input")).toBeVisible();
    await expect(page.getByTestId("login-submit")).toBeVisible();
  });

  // E-AUTH-002: Login page returns 200 (no 404/500)
  test("E-AUTH-002 — login page returns 200", async ({ page }) => {
    const response = await page.goto("/login");
    expect(response?.status()).toBe(200);
  });

  // E-AUTH-003: User signs in with valid Firebase credentials → redirects to /dashboard
  test.fixme("E-AUTH-003 — valid sign-in redirects to /dashboard (requires Firebase test user + backend)", async ({
    page,
  }) => {
    await page.goto("/login");
    // Requires: Firebase test user, backend /auth/verify-token endpoint running
    await page.getByTestId("login-email-input").fill("testuser@example.com");
    await page.getByTestId("login-password-input").fill("testpassword123");
    await page.getByTestId("login-submit").click();
    await expect(page).toHaveURL("/dashboard");
  });

  // E-AUTH-004: Invalid credentials show error message
  test.fixme("E-AUTH-004 — invalid credentials show error message (requires Firebase backend)", async ({
    page,
  }) => {
    await page.goto("/login");
    // Requires: Firebase backend running to reject invalid credentials
    await page.getByTestId("login-email-input").fill("invalid@example.com");
    await page.getByTestId("login-password-input").fill("wrongpassword");
    await page.getByTestId("login-submit").click();
    await expect(page.getByRole("alert")).toBeVisible();
  });
});

test.describe("App Shell — route protection (PERF-115)", () => {
  // E-SHELL-001: Unauthenticated /dashboard redirects to /login
  test("E-SHELL-001 — unauthenticated /dashboard redirects to /login", async ({ page }) => {
    await page.goto("/dashboard");
    // Middleware should redirect to /login when no __session cookie
    await expect(page).toHaveURL(/\/login/);
  });

  // E-SHELL-002: Navigation renders on authenticated pages
  test.fixme("E-SHELL-002 — navigation renders on authenticated pages (requires auth setup)", async ({
    page,
  }) => {
    // Requires: authenticated session (Firebase + __session cookie)
    await page.goto("/dashboard");
    await expect(page.getByTestId("navigation")).toBeVisible();
  });
});

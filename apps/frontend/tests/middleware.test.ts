import { describe, it, expect, vi, beforeEach } from "vitest";

/* ------------------------------------------------------------------ */
/* Mock next/server                                                    */
/* ------------------------------------------------------------------ */

const mockRedirect = vi.fn().mockReturnValue({ type: "redirect" });
const mockNext = vi.fn().mockReturnValue({ type: "next" });

vi.mock("next/server", () => ({
  NextResponse: {
    redirect: (...args: unknown[]) => mockRedirect(...args),
    next: (...args: unknown[]) => mockNext(...args),
  },
}));

/* Import after mocks */
import { middleware, config } from "../middleware";

/* ------------------------------------------------------------------ */
/* Helper: create a mock NextRequest                                   */
/* ------------------------------------------------------------------ */

interface MockRequestOptions {
  pathname: string;
  cookies?: Record<string, string>;
}

function createMockRequest({ pathname, cookies = {} }: MockRequestOptions) {
  return {
    nextUrl: { pathname },
    url: `http://localhost:3000${pathname}`,
    cookies: {
      get: (name: string) => {
        const value = cookies[name];
        if (value === undefined) {
          return undefined;
        }
        return { name, value };
      },
    },
  } as unknown as Parameters<typeof middleware>[0];
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  vi.clearAllMocks();
});

/* ================================================================== */
/* T-SHELL-003: Unauthenticated user hits /dashboard → redirect        */
/* ================================================================== */

describe("T-SHELL-003: Unauthenticated user hits protected route → redirect to /login", () => {
  it("redirects /dashboard to /login when no __session cookie", () => {
    const request = createMockRequest({ pathname: "/dashboard" });

    middleware(request);

    expect(mockRedirect).toHaveBeenCalledTimes(1);
    const redirectUrl = mockRedirect.mock.calls[0]?.[0] as URL;
    expect(redirectUrl.pathname).toBe("/login");
  });

  it("redirects /audit to /login when no __session cookie", () => {
    const request = createMockRequest({ pathname: "/audit" });

    middleware(request);

    expect(mockRedirect).toHaveBeenCalledTimes(1);
    const redirectUrl = mockRedirect.mock.calls[0]?.[0] as URL;
    expect(redirectUrl.pathname).toBe("/login");
  });

  it("redirects /results to /login when no __session cookie", () => {
    const request = createMockRequest({ pathname: "/results" });

    middleware(request);

    expect(mockRedirect).toHaveBeenCalledTimes(1);
    const redirectUrl = mockRedirect.mock.calls[0]?.[0] as URL;
    expect(redirectUrl.pathname).toBe("/login");
  });

  it("redirects /export to /login when no __session cookie", () => {
    const request = createMockRequest({ pathname: "/export" });

    middleware(request);

    expect(mockRedirect).toHaveBeenCalledTimes(1);
    const redirectUrl = mockRedirect.mock.calls[0]?.[0] as URL;
    expect(redirectUrl.pathname).toBe("/login");
  });

  it("redirects when __session cookie is empty string", () => {
    const request = createMockRequest({
      pathname: "/dashboard",
      cookies: { __session: "" },
    });

    middleware(request);

    expect(mockRedirect).toHaveBeenCalledTimes(1);
  });

  it("redirects nested protected routes (e.g. /dashboard/settings)", () => {
    const request = createMockRequest({ pathname: "/dashboard/settings" });

    middleware(request);

    expect(mockRedirect).toHaveBeenCalledTimes(1);
  });
});

/* ================================================================== */
/* Authenticated user passes through                                   */
/* ================================================================== */

describe("Authenticated user with __session cookie passes through", () => {
  it("allows /dashboard with valid __session cookie", () => {
    const request = createMockRequest({
      pathname: "/dashboard",
      cookies: { __session: "valid-session-token" },
    });

    middleware(request);

    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("allows /audit with valid __session cookie", () => {
    const request = createMockRequest({
      pathname: "/audit",
      cookies: { __session: "valid-session-token" },
    });

    middleware(request);

    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("allows /results with valid __session cookie", () => {
    const request = createMockRequest({
      pathname: "/results",
      cookies: { __session: "valid-session-token" },
    });

    middleware(request);

    expect(mockNext).toHaveBeenCalledTimes(1);
  });

  it("allows /export with valid __session cookie", () => {
    const request = createMockRequest({
      pathname: "/export",
      cookies: { __session: "valid-session-token" },
    });

    middleware(request);

    expect(mockNext).toHaveBeenCalledTimes(1);
  });
});

/* ================================================================== */
/* Middleware config matcher                                            */
/* ================================================================== */

describe("Middleware config matcher", () => {
  it("includes all protected route patterns", () => {
    expect(config.matcher).toContain("/dashboard/:path*");
    expect(config.matcher).toContain("/audit/:path*");
    expect(config.matcher).toContain("/results/:path*");
    expect(config.matcher).toContain("/export/:path*");
  });

  it("has exactly 4 matcher patterns", () => {
    expect(config.matcher).toHaveLength(4);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

/* ------------------------------------------------------------------ */
/* Mock next/server                                                    */
/* ------------------------------------------------------------------ */

const mockRedirect = vi.fn().mockReturnValue({ type: "redirect" });
const mockNext = vi.fn().mockReturnValue({ type: "next" });
const mockConstructor = vi.fn();

vi.mock("next/server", () => {
  /**
   * Mock NextResponse as a class so `new NextResponse(...)` works.
   * Static methods (redirect, next) are attached to the class.
   */
  class MockNextResponse {
    type = "response";
    status: number;
    constructor(body: unknown, init?: { status?: number }) {
      this.status = init?.status ?? 200;
      mockConstructor(body, init);
    }
    static redirect = (...args: unknown[]) => mockRedirect(...args);
    static next = (...args: unknown[]) => mockNext(...args);
  }
  return { NextResponse: MockNextResponse };
});

/* Import after mocks */
import { middleware, config } from "../middleware";

/* ------------------------------------------------------------------ */
/* Helper: create a mock NextRequest                                   */
/* ------------------------------------------------------------------ */

interface MockRequestOptions {
  pathname: string;
  hostname?: string;
  cookies?: Record<string, string>;
}

function createMockRequest({ pathname, hostname = "localhost", cookies = {} }: MockRequestOptions) {
  return {
    nextUrl: { pathname, hostname },
    url: `http://${hostname}:3000${pathname}`,
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
  mockRedirect.mockClear();
  mockNext.mockClear();
  mockConstructor.mockClear();
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
/* Runtime validation — production blocking                            */
/* ================================================================== */

describe("Runtime validation route — environment-based access control", () => {
  it("allows /runtime-validation on localhost", () => {
    const request = createMockRequest({ pathname: "/runtime-validation", hostname: "localhost" });

    middleware(request);

    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(mockConstructor).not.toHaveBeenCalled();
  });

  it("allows /runtime-validation on 127.0.0.1", () => {
    const request = createMockRequest({ pathname: "/runtime-validation", hostname: "127.0.0.1" });

    middleware(request);

    expect(mockNext).toHaveBeenCalledTimes(1);
  });

  it("allows /runtime-validation on prefpilot-stage.web.app", () => {
    const request = createMockRequest({
      pathname: "/runtime-validation",
      hostname: "prefpilot-stage.web.app",
    });

    middleware(request);

    expect(mockNext).toHaveBeenCalledTimes(1);
  });

  it("blocks /runtime-validation on production hostname with 404", () => {
    const request = createMockRequest({
      pathname: "/runtime-validation",
      hostname: "nimblevitals.app",
    });

    const result = middleware(request);

    expect(mockConstructor).toHaveBeenCalledWith(null, { status: 404 });
    expect(result).toEqual({ type: "response", status: 404 });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it("blocks /runtime-validation on unknown hostname with 404", () => {
    const request = createMockRequest({
      pathname: "/runtime-validation",
      hostname: "some-other-domain.com",
    });

    const result = middleware(request);

    expect(mockConstructor).toHaveBeenCalledWith(null, { status: 404 });
    expect(result).toEqual({ type: "response", status: 404 });
  });

  it("blocks nested /runtime-validation/ paths on production", () => {
    const request = createMockRequest({
      pathname: "/runtime-validation/something",
      hostname: "nimblevitals.app",
    });

    const result = middleware(request);

    expect(mockConstructor).toHaveBeenCalledWith(null, { status: 404 });
    expect(result).toEqual({ type: "response", status: 404 });
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

  it("includes runtime-validation restricted route", () => {
    expect(config.matcher).toContain("/runtime-validation/:path*");
  });

  it("has exactly 5 matcher patterns", () => {
    expect(config.matcher).toHaveLength(5);
  });
});

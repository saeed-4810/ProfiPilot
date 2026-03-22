/**
 * Next.js Middleware — route protection via __session cookie.
 *
 * Per ADR-010: Server-side session cookie (__session) is set after initial
 * token verification. Middleware checks for this cookie on protected routes.
 *
 * T-SHELL-003: Unauthenticated user hits /dashboard → redirected to /login.
 * E-SHELL-001: page.goto('/dashboard') → URL becomes /login.
 *
 * Protected routes: /dashboard, /audit, /results, /export
 * Restricted routes: /runtime-validation (staging/local only, blocked in production)
 * Public routes: /login, / (root)
 */

import { NextResponse, type NextRequest } from "next/server";

/** Routes that require authentication (checked by path prefix). */
const PROTECTED_PREFIXES = ["/dashboard", "/audit", "/results", "/export"];

/** Cookie name per ADR-010 session lifecycle. */
const SESSION_COOKIE = "__session";

/**
 * Check if a pathname matches any protected route prefix.
 */
function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/**
 * Check if the runtime-validation route is allowed in this environment.
 * Allowed on: localhost, staging (prefpilot-stage).
 * Blocked on: production (any other domain).
 */
function isRuntimeValidationAllowed(hostname: string): boolean {
  return (
    hostname === "localhost" || hostname === "127.0.0.1" || hostname.includes("prefpilot-stage")
  );
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  /* --- Runtime validation: block in production --- */
  if (pathname === "/runtime-validation" || pathname.startsWith("/runtime-validation/")) {
    if (!isRuntimeValidationAllowed(request.nextUrl.hostname)) {
      return new NextResponse(null, { status: 404 });
    }
  }

  /* --- Auth-protected routes --- */
  if (isProtectedRoute(pathname)) {
    const sessionCookie = request.cookies.get(SESSION_COOKIE);

    if (sessionCookie === undefined || sessionCookie.value === "") {
      const loginUrl = new URL("/login", request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

/**
 * Matcher config — run middleware on protected routes + runtime-validation.
 * Excludes static assets, API routes, and Next.js internals.
 */
export const config = {
  matcher: [
    "/dashboard/:path*",
    "/audit/:path*",
    "/results/:path*",
    "/export/:path*",
    "/runtime-validation/:path*",
  ],
};

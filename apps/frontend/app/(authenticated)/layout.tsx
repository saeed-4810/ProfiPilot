"use client";

/**
 * Authenticated layout — wraps all protected pages.
 *
 * PERF-157: Sidebar + top nav bar shell (Stitch-inspired).
 *
 * Desktop (lg+): Fixed top nav bar + fixed left sidebar (w-60) + content offset.
 * Mobile (<lg): Fixed top nav bar + hamburger drawer + full-width content.
 *
 * Provides AuthProvider context, navigation, loading skeleton,
 * and auth guard (redirect to /login if unauthenticated).
 *
 * Auth strategy (two-layer):
 *   Layer 1: Next.js middleware checks __session cookie (server-side, fast).
 *   Layer 2: AuthGuard checks Firebase SDK state OR server session validity.
 *
 * U-SHELL-001: Loading skeleton while auth resolves (no flash of content).
 * U-SHELL-002: Skip-to-content link for accessibility.
 * T-SHELL-004: Navigation rendered on authenticated pages.
 */

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "@/lib/auth";
import { Navigation } from "@/components/Navigation";

/* ------------------------------------------------------------------ */
/* Server session check — validates __session cookie via backend       */
/* ------------------------------------------------------------------ */

const API_BASE = process.env["NEXT_PUBLIC_API_BASE_URL"] ?? "http://localhost:3001";

async function checkServerSession(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/auth/session`, {
      credentials: "include",
    });
    return response.ok;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Auth guard — redirects unauthenticated users                        */
/* ------------------------------------------------------------------ */

function AuthGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [sessionValid, setSessionValid] = useState<boolean | null>(null);

  /* When Firebase SDK has no user, check server session as fallback */
  useEffect(() => {
    if (!loading && user === null) {
      checkServerSession().then((valid) => {
        setSessionValid(valid);
        if (!valid) {
          router.push("/login");
        }
      });
    }
  }, [user, loading, router]);

  /* U-SHELL-001: Loading skeleton while auth state resolves */
  if (loading || (user === null && sessionValid === null)) {
    return (
      <div
        data-testid="auth-loading-skeleton"
        role="status"
        aria-label="Loading"
        className="min-h-screen bg-neutral-950"
      >
        <div className="animate-pulse">
          {/* Top nav skeleton */}
          <div className="h-16 bg-neutral-900/70 border-b border-white/5" />
          <div className="flex">
            {/* Sidebar skeleton (desktop only) */}
            <div className="hidden lg:block w-60 min-h-screen border-r border-white/5">
              <div className="px-4 pt-8 space-y-3">
                <div className="h-8 w-32 rounded bg-neutral-800" />
                <div className="h-8 w-40 rounded bg-neutral-800" />
                <div className="h-8 w-28 rounded bg-neutral-800" />
              </div>
            </div>
            {/* Content skeleton */}
            <div className="flex-1 p-8">
              <div className="h-8 w-48 rounded bg-neutral-800 mb-4" />
              <div className="h-4 w-96 rounded bg-neutral-800 mb-2" />
              <div className="h-4 w-72 rounded bg-neutral-800" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* Don't render children until user is confirmed (Firebase or server session) */
  if (user === null && sessionValid !== true) {
    return null;
  }

  return <>{children}</>;
}

/* ------------------------------------------------------------------ */
/* Authenticated layout                                                */
/* ------------------------------------------------------------------ */

export default function AuthenticatedLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      {/* U-SHELL-002: Skip-to-content link for accessibility */}
      <a
        href="#main-content"
        data-testid="skip-to-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:rounded focus:bg-blue-600 focus:px-4 focus:py-2 focus:text-white focus:text-sm focus:font-medium"
      >
        Skip to content
      </a>

      <AuthGuard>
        <div className="min-h-screen bg-neutral-950 text-neutral-50">
          <Navigation />
          {/* Content area: offset by top nav (h-16) + sidebar (w-60 on lg+) */}
          <main
            id="main-content"
            data-testid="authenticated-main"
            className="lg:ml-60 pt-16 min-h-screen"
          >
            {children}
          </main>
        </div>
      </AuthGuard>
    </AuthProvider>
  );
}

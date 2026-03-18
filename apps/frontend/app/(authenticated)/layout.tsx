"use client";

/**
 * Authenticated layout — wraps all protected pages.
 *
 * Provides AuthProvider context, navigation, loading skeleton,
 * and auth guard (redirect to /login if unauthenticated).
 *
 * U-SHELL-001: Loading skeleton while auth resolves (no flash of content).
 * U-SHELL-002: Skip-to-content link for accessibility.
 * T-SHELL-004: Navigation rendered on authenticated pages.
 */

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "@/lib/auth";
import { Navigation } from "@/components/Navigation";

/* ------------------------------------------------------------------ */
/* Auth guard — redirects unauthenticated users                        */
/* ------------------------------------------------------------------ */

function AuthGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user === null) {
      router.push("/login");
    }
  }, [user, loading, router]);

  /* U-SHELL-001: Loading skeleton while auth state resolves */
  if (loading) {
    return (
      <div
        data-testid="auth-loading-skeleton"
        role="status"
        aria-label="Loading"
        className="min-h-screen bg-neutral-950"
      >
        <div className="animate-pulse">
          {/* Nav skeleton */}
          <div className="h-14 bg-neutral-900 border-b border-neutral-800" />
          {/* Content skeleton */}
          <div className="mx-auto max-w-7xl p-8">
            <div className="h-8 w-48 rounded bg-neutral-800 mb-4" />
            <div className="h-4 w-96 rounded bg-neutral-800 mb-2" />
            <div className="h-4 w-72 rounded bg-neutral-800" />
          </div>
        </div>
      </div>
    );
  }

  /* Don't render children until user is confirmed */
  if (user === null) {
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
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-blue-600 focus:px-4 focus:py-2 focus:text-white focus:text-sm focus:font-medium"
      >
        Skip to content
      </a>

      <AuthGuard>
        <div className="min-h-screen bg-neutral-950 text-neutral-50">
          <Navigation />
          <main id="main-content" data-testid="authenticated-main">
            {children}
          </main>
        </div>
      </AuthGuard>
    </AuthProvider>
  );
}

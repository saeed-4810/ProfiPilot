"use client";

/**
 * Navigation component — responsive sidebar/hamburger menu.
 *
 * T-SHELL-004: Authenticated user sees navigation with active state.
 * U-SHELL-003: Responsive hamburger menu on mobile.
 *
 * Links: Dashboard, Audit, Results, Export
 * Dark theme: bg-neutral-950, text-neutral-50, neutral-400 secondary
 * Tailwind-only styling (no inline styles) per coding standards.
 */

import { useState, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";

/* ------------------------------------------------------------------ */
/* Nav link definitions                                                */
/* ------------------------------------------------------------------ */

interface NavLink {
  href: string;
  label: string;
}

const NAV_LINKS: readonly NavLink[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/audit", label: "Audit" },
  { href: "/results", label: "Results" },
  { href: "/export", label: "Export" },
] as const;

/* ------------------------------------------------------------------ */
/* Navigation component                                                */
/* ------------------------------------------------------------------ */

export function Navigation() {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleMobile = useCallback(() => {
    setMobileOpen((prev) => !prev);
  }, []);

  const closeMobile = useCallback(() => {
    setMobileOpen(false);
  }, []);

  const handleSignOut = useCallback(async () => {
    closeMobile();
    await signOut();
  }, [signOut, closeMobile]);

  return (
    <nav
      data-testid="navigation"
      aria-label="Main navigation"
      className="bg-neutral-900 border-b border-neutral-800"
    >
      <div className="mx-auto max-w-7xl px-4">
        <div className="flex h-14 items-center justify-between">
          {/* Brand */}
          <Link
            href="/dashboard"
            data-testid="nav-brand"
            className="text-lg font-bold text-neutral-50"
          >
            PrefPilot
          </Link>

          {/* Desktop nav links */}
          <div className="hidden md:flex md:items-center md:gap-1" data-testid="nav-desktop-links">
            {NAV_LINKS.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  data-testid={`nav-link-${link.label.toLowerCase()}`}
                  aria-current={isActive ? "page" : undefined}
                  className={`rounded px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-neutral-800 text-neutral-50"
                      : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-50"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>

          {/* Desktop user + sign-out */}
          <div className="hidden md:flex md:items-center md:gap-3">
            {user?.email !== undefined && user.email !== null && (
              <span data-testid="nav-user-email" className="text-sm text-neutral-400">
                {user.email}
              </span>
            )}
            <button
              type="button"
              onClick={handleSignOut}
              data-testid="nav-sign-out"
              className="rounded px-3 py-1.5 text-sm font-medium text-neutral-400 hover:bg-neutral-800 hover:text-neutral-50 transition-colors"
            >
              Sign out
            </button>
          </div>

          {/* Mobile hamburger button */}
          <button
            type="button"
            onClick={toggleMobile}
            data-testid="nav-mobile-toggle"
            aria-expanded={mobileOpen}
            aria-controls="mobile-menu"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            className="md:hidden rounded p-2 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-50 transition-colors"
          >
            {/* Hamburger / close icon */}
            {mobileOpen ? (
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
                />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div
          id="mobile-menu"
          data-testid="nav-mobile-menu"
          className="md:hidden border-t border-neutral-800"
        >
          <div className="space-y-1 px-4 py-3">
            {NAV_LINKS.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={closeMobile}
                  data-testid={`nav-mobile-link-${link.label.toLowerCase()}`}
                  aria-current={isActive ? "page" : undefined}
                  className={`block rounded px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-neutral-800 text-neutral-50"
                      : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-50"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
          <div className="border-t border-neutral-800 px-4 py-3">
            {user?.email !== undefined && user.email !== null && (
              <p data-testid="nav-mobile-user-email" className="text-sm text-neutral-400 mb-2">
                {user.email}
              </p>
            )}
            <button
              type="button"
              onClick={handleSignOut}
              data-testid="nav-mobile-sign-out"
              className="w-full rounded px-3 py-2 text-left text-sm font-medium text-neutral-400 hover:bg-neutral-800 hover:text-neutral-50 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}

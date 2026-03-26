"use client";

/**
 * Navigation component — Stitch-inspired sidebar + top nav bar.
 *
 * PERF-157: Global authenticated layout + sidebar foundation.
 *
 * Desktop (lg+): Fixed left sidebar (w-60) + fixed top nav bar.
 * Mobile (<lg): Top nav bar with hamburger → slide-out drawer.
 *
 * Active routes: Overview (/dashboard), Performance (/audit).
 * Coming-soon items: Security, Accessibility, SEO — visible but non-navigable.
 * Support/Docs footer links satisfy UX-001 Step 7.
 *
 * T-SHELL-004: Authenticated user sees navigation with active state.
 * U-SHELL-003: Responsive navigation on mobile.
 *
 * Dark theme: bg-[#0e0e0f], border-white/5, text-[#adc6ff] primary accent.
 * Font: Manrope (light 300 base, medium 500 active) via globals.css + tailwind.
 * Tailwind-only styling (no inline styles) per coding standards.
 */

import { useState, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";

/* ------------------------------------------------------------------ */
/* Nav item definitions                                                */
/* ------------------------------------------------------------------ */

interface NavItem {
  readonly href: string;
  readonly label: string;
  readonly icon: string;
  readonly comingSoon?: boolean;
}

const NAV_ITEMS: readonly NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: "dashboard" },
  { href: "/audit", label: "Performance", icon: "speed" },
  { href: "#security", label: "Security", icon: "shield", comingSoon: true },
  { href: "#accessibility", label: "Accessibility", icon: "visibility", comingSoon: true },
  { href: "#seo", label: "SEO", icon: "search", comingSoon: true },
] as const;

/** Top nav links — maps to Stitch top bar items. */
interface TopNavLink {
  readonly href: string;
  readonly label: string;
  readonly comingSoon?: boolean;
}

const TOP_NAV_LINKS: readonly TopNavLink[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "#projects", label: "Projects", comingSoon: true },
  { href: "/audit", label: "Audits" },
  { href: "#settings", label: "Settings", comingSoon: true },
] as const;

/* ------------------------------------------------------------------ */
/* Sidebar nav item                                                    */
/* ------------------------------------------------------------------ */

function SidebarNavItem({
  item,
  isActive,
}: {
  readonly item: NavItem;
  readonly isActive: boolean;
}) {
  const baseClasses = "px-4 py-2.5 flex items-center gap-3 rounded-lg transition-all text-sm";

  if (item.comingSoon) {
    return (
      <span
        data-testid={`nav-item-${item.label.toLowerCase()}`}
        aria-label={`${item.label} — Coming soon`}
        className={`${baseClasses} text-gray-500 cursor-default`}
      >
        <span className="material-symbols-outlined text-xl" aria-hidden="true">
          {item.icon}
        </span>
        <span>{item.label}</span>
        <span className="ml-auto text-[10px] uppercase tracking-wider text-gray-600">Soon</span>
      </span>
    );
  }

  return (
    <Link
      href={item.href}
      data-testid={`nav-item-${item.label.toLowerCase()}`}
      aria-current={isActive ? "page" : undefined}
      className={`${baseClasses} ${
        isActive
          ? "bg-white/5 text-[#adc6ff] font-medium"
          : "text-gray-500 hover:text-white hover:bg-white/5"
      }`}
    >
      <span className="material-symbols-outlined text-xl" aria-hidden="true">
        {item.icon}
      </span>
      <span>{item.label}</span>
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Mobile nav item                                                     */
/* ------------------------------------------------------------------ */

function MobileNavItem({
  item,
  isActive,
  onNavigate,
}: {
  readonly item: NavItem;
  readonly isActive: boolean;
  readonly onNavigate: () => void;
}) {
  const baseClasses = "block px-4 py-2.5 flex items-center gap-3 rounded-lg transition-all text-sm";

  if (item.comingSoon) {
    return (
      <span
        data-testid={`nav-mobile-item-${item.label.toLowerCase()}`}
        aria-label={`${item.label} — Coming soon`}
        className={`${baseClasses} text-gray-500 cursor-default`}
      >
        <span className="material-symbols-outlined text-xl" aria-hidden="true">
          {item.icon}
        </span>
        <span>{item.label}</span>
        <span className="ml-auto text-[10px] uppercase tracking-wider text-gray-600">Soon</span>
      </span>
    );
  }

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      data-testid={`nav-mobile-item-${item.label.toLowerCase()}`}
      aria-current={isActive ? "page" : undefined}
      className={`${baseClasses} ${
        isActive
          ? "bg-white/5 text-[#adc6ff] font-medium"
          : "text-gray-500 hover:text-white hover:bg-white/5"
      }`}
    >
      <span className="material-symbols-outlined text-xl" aria-hidden="true">
        {item.icon}
      </span>
      <span>{item.label}</span>
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Top nav bar                                                         */
/* ------------------------------------------------------------------ */

function TopNavBar({
  onMobileToggle,
  mobileOpen,
}: {
  readonly onMobileToggle: () => void;
  readonly mobileOpen: boolean;
}) {
  const pathname = usePathname();
  const { user, signOut } = useAuth();

  const handleSignOut = useCallback(async () => {
    await signOut();
  }, [signOut]);

  return (
    <header
      data-testid="top-nav-bar"
      className="fixed top-0 left-0 right-0 z-50 bg-neutral-950/70 backdrop-blur-md border-b border-white/5"
    >
      <div className="flex justify-between items-center px-4 lg:px-8 h-16 w-full max-w-[1920px] mx-auto">
        {/* Left: Brand + desktop top links */}
        <div className="flex items-center gap-8 lg:gap-12">
          <Link
            href="/dashboard"
            data-testid="nav-brand"
            className="text-lg font-medium tracking-tight text-blue-300"
          >
            NIMBLEVITALS
          </Link>

          {/* Desktop top nav links */}
          <nav
            data-testid="nav-top-links"
            aria-label="Top navigation"
            className="hidden lg:flex gap-6 lg:gap-8 items-center text-sm"
          >
            {TOP_NAV_LINKS.map((link) => {
              const isActive = !link.comingSoon && pathname === link.href;

              if (link.comingSoon) {
                return (
                  <span
                    key={link.label}
                    data-testid={`nav-top-${link.label.toLowerCase()}`}
                    className="text-neutral-600 cursor-default"
                    aria-label={`${link.label} — Coming soon`}
                  >
                    {link.label}
                  </span>
                );
              }

              return (
                <Link
                  key={link.label}
                  href={link.href}
                  data-testid={`nav-top-${link.label.toLowerCase()}`}
                  aria-current={isActive ? "page" : undefined}
                  className={`transition-colors ${
                    isActive
                      ? "text-neutral-50 border-b border-blue-400/50 pb-1"
                      : "text-neutral-500 hover:text-neutral-50"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right: utility icons + user */}
        <div className="flex items-center gap-2 lg:gap-4">
          {/* New Audit CTA — PERF-165 AC8 */}
          <Link
            href="/audit"
            data-testid="nav-new-audit"
            className="hidden lg:flex items-center gap-2 bg-[#adc6ff]/90 hover:bg-[#adc6ff] text-[#002e6a] px-5 py-2 rounded-full font-medium text-sm transition-all"
          >
            New Audit
          </Link>

          {/* Help icon — satisfies UX-001 Step 7 support path */}
          <button
            type="button"
            data-testid="nav-help-button"
            aria-label="Help"
            className="p-2 text-neutral-400 hover:text-neutral-50 transition-colors"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M12 18.75h.008v.008H12v-.008z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </button>

          {/* Divider */}
          <div className="hidden lg:block h-4 w-px bg-white/10" />

          {/* User email + sign out (desktop) */}
          <div className="hidden lg:flex items-center gap-3">
            {user?.email != null && (
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

          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={onMobileToggle}
            data-testid="nav-mobile-toggle"
            aria-expanded={mobileOpen}
            aria-controls="mobile-menu"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            className="lg:hidden rounded p-2 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-50 transition-colors"
          >
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
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Desktop sidebar                                                     */
/* ------------------------------------------------------------------ */

function DesktopSidebar() {
  const pathname = usePathname();

  return (
    <aside
      data-testid="sidebar"
      aria-label="Sidebar navigation"
      className="fixed left-0 top-0 h-full hidden lg:flex flex-col bg-neutral-950 w-60 border-r border-white/5 pt-24 pb-8"
    >
      <nav data-testid="sidebar-nav" aria-label="Main navigation" className="flex-1 space-y-1 px-4">
        {NAV_ITEMS.map((item) => (
          <SidebarNavItem
            key={item.label}
            item={item}
            isActive={!item.comingSoon && pathname === item.href}
          />
        ))}
      </nav>

      {/* Footer: Support + Docs — UX-001 Step 7 */}
      <div data-testid="sidebar-footer" className="px-6 py-4 mt-auto border-t border-white/5">
        <div className="flex flex-col gap-4">
          <a
            href="mailto:support@nimblevitals.app"
            data-testid="sidebar-support-link"
            className="text-neutral-500 hover:text-neutral-50 flex items-center gap-3 text-xs transition-colors"
          >
            <span className="material-symbols-outlined text-lg" aria-hidden="true">
              support_agent
            </span>
            <span>Support</span>
          </a>
          <a
            href="https://docs.nimblevitals.app"
            target="_blank"
            rel="noopener noreferrer"
            data-testid="sidebar-docs-link"
            className="text-neutral-500 hover:text-neutral-50 flex items-center gap-3 text-xs transition-colors"
          >
            <span className="material-symbols-outlined text-lg" aria-hidden="true">
              menu_book
            </span>
            <span>Docs</span>
          </a>
        </div>
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/* Mobile drawer                                                       */
/* ------------------------------------------------------------------ */

function MobileDrawer({
  isOpen,
  onClose,
}: {
  readonly isOpen: boolean;
  readonly onClose: () => void;
}) {
  const pathname = usePathname();
  const { user, signOut } = useAuth();

  const handleSignOut = useCallback(async () => {
    onClose();
    await signOut();
  }, [signOut, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        data-testid="mobile-backdrop"
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
        onClick={onClose}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
        role="presentation"
      />

      {/* Drawer panel */}
      <div
        id="mobile-menu"
        data-testid="nav-mobile-menu"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        className="fixed left-0 top-16 bottom-0 z-50 w-72 bg-neutral-950 border-r border-white/5 lg:hidden overflow-y-auto"
      >
        <nav aria-label="Mobile navigation" className="space-y-1 px-4 py-4">
          {NAV_ITEMS.map((item) => (
            <MobileNavItem
              key={item.label}
              item={item}
              isActive={!item.comingSoon && pathname === item.href}
              onNavigate={onClose}
            />
          ))}
        </nav>

        {/* User + sign out */}
        <div className="border-t border-white/5 px-4 py-4">
          {user?.email != null && (
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

        {/* Support + Docs */}
        <div className="border-t border-white/5 px-6 py-4">
          <div className="flex flex-col gap-4">
            <a
              href="mailto:support@nimblevitals.app"
              data-testid="mobile-support-link"
              className="text-neutral-500 hover:text-neutral-50 flex items-center gap-3 text-xs transition-colors"
            >
              <span className="material-symbols-outlined text-lg" aria-hidden="true">
                support_agent
              </span>
              <span>Support</span>
            </a>
            <a
              href="https://docs.nimblevitals.app"
              target="_blank"
              rel="noopener noreferrer"
              data-testid="mobile-docs-link"
              className="text-neutral-500 hover:text-neutral-50 flex items-center gap-3 text-xs transition-colors"
            >
              <span className="material-symbols-outlined text-lg" aria-hidden="true">
                menu_book
              </span>
              <span>Docs</span>
            </a>
          </div>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Main Navigation export                                              */
/* ------------------------------------------------------------------ */

export function Navigation() {
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleMobile = useCallback(() => {
    setMobileOpen((prev) => !prev);
  }, []);

  const closeMobile = useCallback(() => {
    setMobileOpen(false);
  }, []);

  return (
    <div data-testid="navigation">
      <TopNavBar onMobileToggle={toggleMobile} mobileOpen={mobileOpen} />
      <DesktopSidebar />
      <MobileDrawer isOpen={mobileOpen} onClose={closeMobile} />
    </div>
  );
}

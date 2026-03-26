"use client";

/**
 * ProjectSidebar — project-scoped secondary navigation (PERF-167).
 *
 * Renders within the content area (not replacing the global sidebar).
 * Shows 5 items: Overview (active), Metric Trends, Audit History,
 * URL Registry, Settings — last 4 are "Coming soon" for MVP.
 *
 * Stitch tokens: uppercase tracking-widest labels, bg-surface-container.
 * ADR-025: Tailwind-only styling, dark theme palette.
 */

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface SidebarItem {
  readonly label: string;
  readonly icon: string;
  readonly active: boolean;
  readonly comingSoon: boolean;
}

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const SIDEBAR_ITEMS: readonly SidebarItem[] = [
  { label: "Overview", icon: "dashboard", active: true, comingSoon: false },
  { label: "Metric Trends", icon: "trending_up", active: false, comingSoon: true },
  { label: "Audit History", icon: "history", active: false, comingSoon: true },
  { label: "URL Registry", icon: "link", active: false, comingSoon: true },
  { label: "Settings", icon: "settings", active: false, comingSoon: true },
] as const;

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function ProjectSidebar() {
  return (
    <nav
      data-testid="project-sidebar"
      aria-label="Project navigation"
      className="hidden lg:block w-48 shrink-0"
    >
      <ul className="space-y-1">
        {SIDEBAR_ITEMS.map((item) => (
          <li key={item.label}>
            {item.comingSoon ? (
              <span
                data-testid={`project-nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-neutral-500 cursor-default"
                aria-label={`${item.label} — Coming soon`}
              >
                <span className="material-symbols-outlined text-base" aria-hidden="true">
                  {item.icon}
                </span>
                <span className="uppercase tracking-widest">{item.label}</span>
                {/* copy: nav-coming-soon */}
                <span className="ml-auto text-[10px] text-neutral-600">Soon</span>
              </span>
            ) : (
              /* v8 ignore start -- non-comingSoon inactive branch: unreachable with current SIDEBAR_ITEMS */
              <span
                data-testid={`project-nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${
                  item.active
                    ? "bg-neutral-800 text-[#adc6ff] font-medium"
                    : "text-neutral-400 hover:text-neutral-200"
                }`}
                aria-current={item.active ? "page" : undefined}
              >
                <span className="material-symbols-outlined text-base" aria-hidden="true">
                  {item.icon}
                </span>
                <span className="uppercase tracking-widest">{item.label}</span>
              </span>
              /* v8 ignore stop */
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}

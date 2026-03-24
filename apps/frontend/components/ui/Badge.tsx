/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type BadgeVariant =
  | "success"
  | "warning"
  | "error"
  | "info"
  | "neutral"
  | "severity-good"
  | "severity-warning"
  | "severity-error";

interface BadgeProps {
  /** Text displayed inside the badge. */
  label: string;
  /** Color variant. */
  variant?: BadgeVariant;
}

/* ------------------------------------------------------------------ */
/* Style maps                                                          */
/* ------------------------------------------------------------------ */

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  success: "bg-green-900/50 text-green-300 border-green-700",
  warning: "bg-yellow-900/50 text-yellow-300 border-yellow-700",
  error: "bg-red-900/50 text-red-300 border-red-700",
  info: "bg-blue-900/50 text-blue-300 border-blue-700",
  neutral: "bg-neutral-800 text-neutral-300 border-neutral-700",
  "severity-good": "bg-green-500/10 text-green-400 border-green-500/20",
  "severity-warning": "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  "severity-error": "bg-red-500/10 text-red-400 border-red-500/20",
};

/* ------------------------------------------------------------------ */
/* Severity icon SVGs — 12×12 inline icons                             */
/* ------------------------------------------------------------------ */

const SEVERITY_ICONS: Partial<Record<BadgeVariant, React.ReactNode>> = {
  "severity-good": (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-testid="badge-icon"
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  ),
  "severity-warning": (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-testid="badge-icon"
    >
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    </svg>
  ),
  "severity-error": (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-testid="badge-icon"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4M12 16h.01" />
    </svg>
  ),
};

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

/**
 * Color-coded status badge for audit status, project status, etc.
 *
 * - Tailwind-only styling.
 * - Eight semantic variants matching the dark theme palette.
 * - Severity variants (severity-good/warning/error) include icon prefixes.
 */
export function Badge({ label, variant = "neutral" }: BadgeProps) {
  const icon = SEVERITY_ICONS[variant];

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${VARIANT_CLASSES[variant]}`}
    >
      {icon !== undefined && icon}
      {label}
    </span>
  );
}

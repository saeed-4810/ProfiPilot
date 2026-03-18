/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type BadgeVariant = "success" | "warning" | "error" | "info" | "neutral";

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
};

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

/**
 * Color-coded status badge for audit status, project status, etc.
 *
 * - Tailwind-only styling.
 * - Five semantic variants matching the dark theme palette.
 */
export function Badge({ label, variant = "neutral" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${VARIANT_CLASSES[variant]}`}
    >
      {label}
    </span>
  );
}

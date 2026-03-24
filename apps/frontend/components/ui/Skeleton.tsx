import type { CSSProperties } from "react";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type SkeletonVariant = "text" | "circular" | "rectangular";

interface SkeletonProps {
  /** Width of the skeleton element (CSS value). */
  width?: string;
  /** Height of the skeleton element (CSS value). */
  height?: string;
  /** Additional Tailwind classes. */
  className?: string;
  /** Shape variant. */
  variant?: SkeletonVariant;
}

/* ------------------------------------------------------------------ */
/* Style maps                                                          */
/* ------------------------------------------------------------------ */

const VARIANT_CLASSES: Record<SkeletonVariant, string> = {
  text: "rounded",
  circular: "rounded-full",
  rectangular: "rounded-lg",
};

/**
 * Shimmer gradient background for skeleton loading.
 * Uses a linear gradient that sweeps left-to-right via the `animate-shimmer`
 * keyframe defined in tailwind.config.ts.
 *
 * neutral-800 (#262626) → neutral-700 (#404040) → neutral-800 (#262626)
 */
const SHIMMER_BG =
  "bg-[length:200%_100%] bg-[linear-gradient(90deg,#262626_25%,#404040_50%,#262626_75%)]";

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

/**
 * Skeleton placeholder for loading states.
 *
 * - Uses a shimmer gradient animation (left-to-right sweep).
 * - prefers-reduced-motion: no animation, just a static gray block
 *   (handled via Tailwind's built-in motion-reduce support).
 * - Three shape variants: text, circular, rectangular.
 */
export function Skeleton({ width, height, className = "", variant = "text" }: SkeletonProps) {
  const style: CSSProperties = {};
  if (width !== undefined) {
    style.width = width;
  }
  if (height !== undefined) {
    style.height = height;
  }

  return (
    <div
      role="status"
      aria-label="Loading"
      style={style}
      className={`${SHIMMER_BG} animate-shimmer motion-reduce:animate-none ${VARIANT_CLASSES[variant]} ${className}`.trim()}
    />
  );
}

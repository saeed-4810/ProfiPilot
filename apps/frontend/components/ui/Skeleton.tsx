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

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

/**
 * Skeleton placeholder for loading states.
 *
 * - Uses Tailwind animate-pulse for shimmer effect.
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
      className={`bg-neutral-700 animate-pulse motion-reduce:animate-none ${VARIANT_CLASSES[variant]} ${className}`.trim()}
    />
  );
}

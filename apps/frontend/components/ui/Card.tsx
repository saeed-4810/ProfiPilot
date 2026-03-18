"use client";

import type { HTMLAttributes, ReactNode, KeyboardEvent } from "react";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, "onClick"> {
  children: ReactNode;
  /** Additional Tailwind classes. */
  className?: string;
  /** Whether the card has a hover effect (for clickable cards). */
  hoverable?: boolean;
  /** Click/activate handler — called on click, Enter, or Space. */
  onClick?: () => void;
}

/* ------------------------------------------------------------------ */
/* Keyboard handler factory                                            */
/* ------------------------------------------------------------------ */

function createKeyDownHandler(onActivate: () => void) {
  return (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onActivate();
    }
  };
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

/**
 * Dark-themed card container.
 *
 * - bg-neutral-900, border-neutral-800 matching the project palette.
 * - Optional hover effect for interactive/clickable cards.
 * - Tailwind-only styling.
 */
export function Card({ children, className = "", hoverable = false, onClick, ...rest }: CardProps) {
  const hoverClasses = hoverable
    ? "cursor-pointer hover:border-neutral-700 hover:bg-neutral-800 transition-colors"
    : "";

  return (
    <div
      className={`rounded-lg border border-neutral-800 bg-neutral-900 p-6 ${hoverClasses} ${className}`.trim()}
      onClick={onClick}
      role={onClick !== undefined ? "button" : undefined}
      tabIndex={onClick !== undefined ? 0 : undefined}
      onKeyDown={onClick !== undefined ? createKeyDownHandler(onClick) : undefined}
      {...rest}
    >
      {children}
    </div>
  );
}

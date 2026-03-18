"use client";

import type { InputHTMLAttributes } from "react";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Label text rendered above the input. */
  label: string;
  /** Error message — triggers red border and aria-invalid. */
  error?: string;
  /** Helper text shown below the input (hidden when error is present). */
  helperText?: string;
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

/**
 * Shared Input component with label, error, and helper text support.
 *
 * - Tailwind-only styling matching the dark theme.
 * - Error state: red border, error message below with aria-describedby.
 * - aria-invalid when error is present.
 * - Focus ring for keyboard navigation.
 */
export function Input({
  label,
  error,
  helperText,
  id,
  className = "",
  disabled,
  ...rest
}: InputProps) {
  const inputId = id ?? `input-${label.toLowerCase().replace(/\s+/g, "-")}`;
  const errorId = `${inputId}-error`;
  const helperId = `${inputId}-helper`;
  const hasError = error !== undefined && error !== "";

  const describedBy = hasError
    ? errorId
    : helperText !== undefined && helperText !== ""
      ? helperId
      : undefined;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="block text-sm font-medium text-neutral-300">
        {label}
      </label>

      <input
        id={inputId}
        disabled={disabled}
        aria-invalid={hasError ? "true" : undefined}
        aria-describedby={describedBy}
        className={`w-full px-3 py-2 rounded bg-neutral-800 border text-neutral-50 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 ${hasError ? "border-red-500" : "border-neutral-700"} ${className}`.trim()}
        {...rest}
      />

      {hasError && (
        <p id={errorId} className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}

      {!hasError && helperText !== undefined && helperText !== "" && (
        <p id={helperId} className="text-sm text-neutral-500">
          {helperText}
        </p>
      )}
    </div>
  );
}

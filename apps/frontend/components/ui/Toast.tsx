"use client";

import { useEffect, useCallback } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type ToastType = "success" | "error" | "info";

interface ToastProps {
  /** Message to display. */
  message: string;
  /** Toast type — determines color and ARIA role. */
  type?: ToastType;
  /** Callback when the toast is dismissed. */
  onDismiss: () => void;
  /** Auto-dismiss duration in milliseconds (default 5000). */
  duration?: number;
  /** Controls visibility for AnimatePresence. */
  open?: boolean;
}

/* ------------------------------------------------------------------ */
/* Style maps                                                          */
/* ------------------------------------------------------------------ */

const TYPE_CLASSES: Record<ToastType, string> = {
  success: "bg-green-900/90 border-green-700 text-green-200",
  error: "bg-red-900/90 border-red-700 text-red-200",
  info: "bg-blue-900/90 border-blue-700 text-blue-200",
};

/* ------------------------------------------------------------------ */
/* Animation variants                                                  */
/* ------------------------------------------------------------------ */

const slideVariants = {
  initial: { opacity: 0, y: -20, x: 0 },
  animate: { opacity: 1, y: 0, x: 0 },
  exit: { opacity: 0, y: -20, x: 0 },
};

const reducedVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

/* ------------------------------------------------------------------ */
/* Default duration                                                    */
/* ------------------------------------------------------------------ */

const DEFAULT_DURATION = 5000;

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

/**
 * Toast notification with auto-dismiss and Framer Motion animation.
 *
 * - role="alert" for errors, role="status" for success/info.
 * - Auto-dismiss after configurable duration.
 * - Framer Motion slide-in with prefers-reduced-motion fallback.
 * - Dismiss button (X).
 */
export function Toast({
  message,
  type = "info",
  onDismiss,
  duration = DEFAULT_DURATION,
  open = true,
}: ToastProps) {
  const prefersReduced = useReducedMotion();
  const variants = prefersReduced === true ? reducedVariants : slideVariants;

  const handleAutoDismiss = useCallback(() => {
    onDismiss();
  }, [onDismiss]);

  useEffect(() => {
    if (!open) return;

    const timer = setTimeout(handleAutoDismiss, duration);
    return () => {
      clearTimeout(timer);
    };
  }, [open, duration, handleAutoDismiss]);

  const ariaRole = type === "error" ? "alert" : "status";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role={ariaRole}
          variants={variants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ duration: prefersReduced === true ? 0.05 : 0.2, ease: "easeOut" }}
          className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 shadow-lg ${TYPE_CLASSES[type]}`}
        >
          <p className="text-sm">{message}</p>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss notification"
            className="shrink-0 rounded p-1 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/30 transition-colors"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

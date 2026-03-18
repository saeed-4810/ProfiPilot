"use client";

import { useEffect, useRef, useCallback, useId, type ReactNode } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface ModalProps {
  /** Whether the modal is open. */
  open: boolean;
  /** Callback to close the modal. */
  onClose: () => void;
  /** Modal title — rendered in the header and used for aria-labelledby. */
  title: string;
  /** Modal body content. */
  children: ReactNode;
}

/* ------------------------------------------------------------------ */
/* Animation variants                                                  */
/* ------------------------------------------------------------------ */

const backdropVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

const panelVariants = {
  initial: { opacity: 0, y: 40, scale: 0.95 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 40, scale: 0.95 },
};

const reducedPanelVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

/* ------------------------------------------------------------------ */
/* Focus trap helper                                                   */
/* ------------------------------------------------------------------ */

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function trapFocus(container: HTMLElement, event: KeyboardEvent): void {
  const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));

  /* The close button is always present, so focusable is never empty.
     Use safe indexing to satisfy TypeScript strict mode. */
  const first = focusable.at(0);
  const last = focusable.at(-1);

  if (event.shiftKey && first !== undefined && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && last !== undefined && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

/**
 * Accessible modal dialog with Framer Motion animation.
 *
 * - Backdrop overlay (click to close).
 * - Escape key to close.
 * - Focus trap (focus stays inside modal).
 * - aria-modal="true", role="dialog", aria-labelledby.
 * - Framer Motion enter/exit animation with prefers-reduced-motion fallback.
 */
export function Modal({ open, onClose, title, children }: ModalProps) {
  const prefersReduced = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (event.key === "Tab" && panelRef.current !== null) {
        trapFocus(panelRef.current, event);
      }
    },
    [onClose]
  );

  /* Manage focus: save previous, move into modal, restore on close */
  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement as HTMLElement | null;
      document.addEventListener("keydown", handleKeyDown);

      /* Focus the first focusable element after animation frame so the element is mounted.
         The close button is always present, so querySelector will always find at least one. */
      requestAnimationFrame(() => {
        const firstFocusable = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
        if (firstFocusable !== undefined && firstFocusable !== null) {
          firstFocusable.focus();
        }
      });
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (!open && previousFocusRef.current !== null) {
        previousFocusRef.current.focus();
        previousFocusRef.current = null;
      }
    };
  }, [open, handleKeyDown]);

  const reactId = useId();
  const titleId = `modal-title-${reactId}`;

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <motion.div
            data-testid="modal-backdrop"
            variants={backdropVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: prefersReduced === true ? 0.05 : 0.3, ease: "easeOut" }}
            className="absolute inset-0 bg-black/60"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Panel */}
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            variants={prefersReduced === true ? reducedPanelVariants : panelVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: prefersReduced === true ? 0.05 : 0.35, ease: "easeOut" }}
            className="relative z-10 w-full max-w-md rounded-lg border border-neutral-800 bg-neutral-900 p-6 shadow-xl focus:outline-none"
          >
            {/* Header */}
            <div className="mb-4 flex items-center justify-between">
              <h2 id={titleId} className="text-lg font-semibold text-neutral-50">
                {title}
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close dialog"
                className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="text-neutral-300">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

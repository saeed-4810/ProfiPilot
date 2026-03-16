"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

const pageVariants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
};

const reducedVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

interface MotionWrapperProps {
  children: ReactNode;
  className?: string;
}

/**
 * Wraps page content with a Framer Motion entry animation.
 * Automatically switches to a minimal opacity-only fade when
 * `prefers-reduced-motion` is enabled.
 */
export function MotionWrapper({ children, className }: MotionWrapperProps) {
  const prefersReduced = useReducedMotion();
  const variants = prefersReduced ? reducedVariants : pageVariants;

  return (
    <motion.div
      className={className}
      variants={variants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: prefersReduced ? 0.1 : 0.3, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

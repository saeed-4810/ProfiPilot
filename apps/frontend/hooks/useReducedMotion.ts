"use client";

import { useEffect, useState } from "react";

/**
 * Returns true when the user has enabled the "prefers-reduced-motion" OS setting.
 * Use this to conditionally disable or simplify animations across the app.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);

    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return reduced;
}

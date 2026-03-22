"use client";

/**
 * PostHog analytics provider — PERF-122.
 *
 * Initializes posthog-js on the client side and sets it as the
 * analytics provider for the app via lib/analytics.ts.
 *
 * Configuration:
 * - persistence: 'memory' — cookieless mode, no consent banner needed (U-PERF-122-002)
 * - autocapture: false — we control all events explicitly (P-PERF-122-002)
 * - capture_pageview: false — manual page_view events via ADR-002 contract
 * - API key from NEXT_PUBLIC_POSTHOG_KEY env var (T-PERF-122-008)
 *
 * T-PERF-122-001: PostHog SDK initialized on app load.
 * U-PERF-122-001: Script loaded async via posthog-js (no LCP impact).
 */

import { useEffect, type ReactNode } from "react";
import posthog from "posthog-js";
import { setAnalyticsProvider, createPostHogProvider } from "@/lib/analytics";

/** Default PostHog configuration from environment variables. */
const DEFAULT_POSTHOG_KEY = process.env["NEXT_PUBLIC_POSTHOG_KEY"] ?? "";
const DEFAULT_POSTHOG_HOST = process.env["NEXT_PUBLIC_POSTHOG_HOST"] ?? "https://eu.i.posthog.com";

interface PostHogProviderProps {
  readonly children: ReactNode;
  /** PostHog project API key. Defaults to NEXT_PUBLIC_POSTHOG_KEY env var. */
  readonly apiKey?: string;
  /** PostHog API host. Defaults to NEXT_PUBLIC_POSTHOG_HOST env var. */
  readonly apiHost?: string;
}

/**
 * Wraps children and initializes PostHog on mount.
 * No-ops if apiKey is empty (dev without analytics).
 */
export function PostHogProvider({
  children,
  apiKey = DEFAULT_POSTHOG_KEY,
  apiHost = DEFAULT_POSTHOG_HOST,
}: PostHogProviderProps): ReactNode {
  useEffect(() => {
    if (apiKey === "") {
      return;
    }

    posthog.init(apiKey, {
      api_host: apiHost,
      persistence: "memory",
      autocapture: false,
      capture_pageview: false,
      disable_session_recording: true,
      loaded: () => {
        setAnalyticsProvider(createPostHogProvider(posthog));
      },
    });
  }, [apiKey, apiHost]);

  return <>{children}</>;
}

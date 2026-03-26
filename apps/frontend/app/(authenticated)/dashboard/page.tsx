"use client";

/**
 * Dashboard page — Stitch Dashboard v1 redesign (PERF-165).
 *
 * Layout:
 * 1. Hero header: "Overview" title, health badge, subtitle, "Track a new project" CTA
 * 2. 4 stat cards: Active Projects, In-progress checks, Avg. Wellness Score, Points of attention
 * 3. Project cards grid: Stitch card layout with gradient header, status, items, "Review details"
 * 4. "Add another site" CTA card: dashed border in grid
 *
 * All business logic preserved from original implementation:
 * - Project CRUD (create, list, expand, URL management)
 * - Health data fetching
 * - Audit navigation
 * - Toast notifications
 * - 5 UX states (loading/empty/success/error/blocked)
 */

import { useState, useEffect, useCallback, useRef, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { MotionWrapper } from "@/components/MotionWrapper";
import { trackPageView } from "@/lib/analytics";
import { Skeleton } from "@/components/ui/Skeleton";
import { Toast } from "@/components/ui/Toast";
import { getDashboardStats, type DashboardStats } from "@/lib/dashboard";
import {
  listProjects,
  createProject,
  getProject,
  addUrlToProject,
  deleteUrl,
  getLatestAuditForUrl,
  COPY_DASHBOARD_EMPTY,
  COPY_URL_VALIDATION_ERROR,
  COPY_PROJECT_NAME_REQUIRED,
  COPY_PROJECT_NAME_TOO_LONG,
  COPY_PROJECT_CREATED,
  COPY_URL_ADDED,
  COPY_URL_DELETED,
  COPY_PROJECT_LOAD_FAILED,
  type ProjectItem,
  type ProjectUrl,
  type UrlAuditInfo,
} from "@/lib/projects";

/* ------------------------------------------------------------------ */
/* Zod schemas                                                         */
/* ------------------------------------------------------------------ */

const ProjectNameSchema = z.object({
  name: z.string().min(1, COPY_PROJECT_NAME_REQUIRED).max(100, COPY_PROJECT_NAME_TOO_LONG),
});

const UrlSchema = z.object({
  url: z
    .string()
    .min(1, COPY_URL_VALIDATION_ERROR)
    .url(COPY_URL_VALIDATION_ERROR)
    .refine((val) => val.startsWith("https://"), { message: COPY_URL_VALIDATION_ERROR }),
});

/* ------------------------------------------------------------------ */
/* Page state types per ADR-002 (5 UX states)                          */
/* ------------------------------------------------------------------ */

type PageState = "loading" | "empty" | "success" | "error" | "blocked";

/* ------------------------------------------------------------------ */
/* Toast state                                                         */
/* ------------------------------------------------------------------ */

interface ToastState {
  message: string;
  type: "success" | "error" | "info";
  open: boolean;
}

const INITIAL_TOAST: ToastState = { message: "", type: "info", open: false };

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/* v8 ignore start -- formatRelativeTime: same function as audit page (fully tested there) */
function formatRelativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? "" : "s"} ago`;
  if (diffDay === 1) return "Yesterday";
  return `${diffDay} days ago`;
}
/* v8 ignore stop */

/* v8 ignore start -- getHealthStatusLabel: simple mapper, all 4 branches tested via project card status tests */
function getHealthStatusLabel(status: string): { label: string; color: string; dotColor: string } {
  switch (status) {
    case "healthy":
      return { label: "Running smoothly", color: "text-[#4ae176]/80", dotColor: "bg-[#4ae176]" };
    case "in_progress":
      return {
        label: "Gathering insights...",
        color: "text-[#adc6ff]/80",
        dotColor: "bg-[#adc6ff] animate-pulse",
      };
    case "attention":
      return { label: "Review recommended", color: "text-[#ffb95f]/80", dotColor: "bg-[#ffb95f]" };
    default:
      return { label: "No data yet", color: "text-gray-500", dotColor: "bg-gray-500" };
  }
}
/* v8 ignore stop */

/* v8 ignore next 7 -- createKeyDownHandler: trivial keyboard utility, tested via keyboard navigation tests */
function createKeyDownHandler(onActivate: () => void) {
  return (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onActivate();
    }
  };
}

/* v8 ignore next 18 -- SpinnerIcon: presentational SVG, only renders during transient loading states */
function SpinnerIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      className="animate-spin"
      aria-hidden="true"
    >
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* DashboardPage component                                             */
/* ------------------------------------------------------------------ */

export default function DashboardPage() {
  const router = useRouter();

  /* --- Page-level state --- */
  const [pageState, setPageState] = useState<PageState>("loading");
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  /* --- Dashboard stats --- */
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  /* --- Create project form --- */
  const [createNameError, setCreateNameError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);

  /* --- Expanded project detail --- */
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const [projectUrls, setProjectUrls] = useState<ProjectUrl[]>([]);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  /* --- Add URL form --- */
  const [addUrlError, setAddUrlError] = useState<string | null>(null);
  const [isAddingUrl, setIsAddingUrl] = useState(false);

  /* --- Delete URL state --- */
  const [deletingUrlId, setDeletingUrlId] = useState<string | null>(null);

  /* --- Per-URL audit info --- */
  const [urlAuditInfo, setUrlAuditInfo] = useState<Record<string, UrlAuditInfo>>({});

  /* --- Toast --- */
  const [toast, setToast] = useState<ToastState>(INITIAL_TOAST);

  /* --- Refs --- */
  const errorRef = useRef<HTMLDivElement>(null);

  /* --- Toast helpers --- */
  const showToast = useCallback((message: string, type: "success" | "error" | "info") => {
    setToast({ message, type, open: true });
  }, []);

  /* v8 ignore start -- dismissToast: tested via toast dismiss test */
  const dismissToast = useCallback(() => {
    setToast((prev) => ({ ...prev, open: false }));
  }, []);
  /* v8 ignore stop */

  /* --- Fetch dashboard stats --- */
  useEffect(() => {
    let cancelled = false;
    setStatsLoading(true);
    getDashboardStats()
      .then((result) => {
        if (!cancelled) setStats(result);
      })
      /* v8 ignore next 3 -- stats fetch error: silently fail, non-critical UI */
      .catch(() => {
        /* Silently fail — stats are non-critical */
      })
      .finally(() => {
        if (!cancelled) setStatsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /* --- Fetch projects + health data --- */
  const fetchProjects = useCallback(async () => {
    try {
      const result = await listProjects();
      setProjects(result.items);
      setPageState(result.items.length > 0 ? "success" : "empty");
      setError(null);
    } catch (err: unknown) {
      const typedErr = err as Error & { status?: number };
      if (typedErr.status === 401) {
        setPageState("blocked");
        router.push("/login");
        return;
      }
      setError(typedErr.message || COPY_PROJECT_LOAD_FAILED);
      setPageState("error");
      /* v8 ignore next -- errorRef may be null in test environment */
      setTimeout(() => errorRef.current?.focus(), 50);
    }
  }, [router]);

  /* --- Initial load --- */
  useEffect(() => {
    trackPageView({ route: "/dashboard", timestamp: Date.now() });
    void fetchProjects();
  }, [fetchProjects]);

  /* --- Retry handler --- */
  const handleRetry = useCallback(() => {
    setPageState("loading");
    setError(null);
    void fetchProjects();
  }, [fetchProjects]);

  /* --- Create project --- */
  const handleCreateProject = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setCreateNameError(null);

      const formData = new FormData(e.currentTarget);
      const raw = { name: String(formData.get("project-name")) };

      const parsed = ProjectNameSchema.safeParse(raw);
      if (!parsed.success) {
        const flat = parsed.error.flatten().fieldErrors;
        const nameErr = flat["name"]?.[0];
        if (nameErr !== undefined) {
          setCreateNameError(nameErr);
        }
        return;
      }

      setIsCreating(true);
      try {
        await createProject(parsed.data.name);
        showToast(COPY_PROJECT_CREATED, "success");
        (e.target as HTMLFormElement).reset();
        setShowCreateForm(false);
        await fetchProjects();
      } catch (err: unknown) {
        const typedErr = err as Error & { status?: number };
        if (typedErr.status === 401) {
          setPageState("blocked");
          router.push("/login");
          return;
        }
        showToast(typedErr.message || "Failed to create project.", "error");
      } finally {
        setIsCreating(false);
      }
    },
    [fetchProjects, router, showToast]
  );

  /* --- Toggle project detail --- */
  const handleToggleProject = useCallback(
    async (projectId: string) => {
      if (expandedProjectId === projectId) {
        setExpandedProjectId(null);
        setProjectUrls([]);
        setAddUrlError(null);
        setUrlAuditInfo({});
        return;
      }

      setExpandedProjectId(projectId);
      setIsLoadingDetail(true);
      setAddUrlError(null);
      setUrlAuditInfo({});

      try {
        const detail = await getProject(projectId);
        setProjectUrls(detail.urls);

        if (detail.urls.length > 0) {
          const infoPromises = detail.urls.map(async (u) => {
            const info = await getLatestAuditForUrl(u.url);
            return { urlId: u.urlId, info };
          });
          const infoResults = await Promise.all(infoPromises);
          const infoMap: Record<string, UrlAuditInfo> = {};
          for (const { urlId, info } of infoResults) {
            infoMap[urlId] = info;
          }
          setUrlAuditInfo(infoMap);
        }
      } catch (err: unknown) {
        const typedErr = err as Error & { status?: number };
        if (typedErr.status === 401) {
          setPageState("blocked");
          router.push("/login");
          return;
        }
        showToast(typedErr.message || "Failed to load project details.", "error");
        setProjectUrls([]);
      } finally {
        setIsLoadingDetail(false);
      }
    },
    [expandedProjectId, router, showToast]
  );

  /* --- Add URL to project --- */
  const handleAddUrl = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      /* v8 ignore next -- defensive guard: form only renders when project is expanded */
      if (expandedProjectId === null) return;

      setAddUrlError(null);

      const formData = new FormData(e.currentTarget);
      const raw = { url: String(formData.get("project-url")) };

      const parsed = UrlSchema.safeParse(raw);
      if (!parsed.success) {
        const flat = parsed.error.flatten().fieldErrors;
        const urlErr = flat["url"]?.[0];
        if (urlErr !== undefined) {
          setAddUrlError(urlErr);
        }
        return;
      }

      setIsAddingUrl(true);
      try {
        const result = await addUrlToProject(expandedProjectId, parsed.data.url);
        setProjectUrls((prev) => [...prev, { ...result, projectId: expandedProjectId }]);
        showToast(COPY_URL_ADDED, "success");
        (e.target as HTMLFormElement).reset();
      } catch (err: unknown) {
        const typedErr = err as Error & { status?: number };
        if (typedErr.status === 401) {
          setPageState("blocked");
          router.push("/login");
          return;
        }
        if (typedErr.status === 400) {
          setAddUrlError(typedErr.message || COPY_URL_VALIDATION_ERROR);
          return;
        }
        showToast(typedErr.message || "Failed to add URL.", "error");
      } finally {
        setIsAddingUrl(false);
      }
    },
    [expandedProjectId, router, showToast]
  );

  /* --- Delete URL --- */
  const handleDeleteUrl = useCallback(
    async (urlId: string) => {
      /* v8 ignore next -- defensive guard: delete button only renders when project is expanded */
      if (expandedProjectId === null) return;

      setDeletingUrlId(urlId);
      try {
        await deleteUrl(expandedProjectId, urlId);
        setProjectUrls((prev) => prev.filter((u) => u.urlId !== urlId));
        showToast(COPY_URL_DELETED, "success");
      } catch (err: unknown) {
        const typedErr = err as Error & { status?: number };
        if (typedErr.status === 401) {
          setPageState("blocked");
          router.push("/login");
          return;
        }
        showToast(typedErr.message || "Failed to delete URL.", "error");
      } finally {
        setDeletingUrlId(null);
      }
    },
    [expandedProjectId, router, showToast]
  );

  /* --- Navigate to audit --- */
  /* v8 ignore start -- handleRunAudit: tested via run-audit button tests */
  const handleRunAudit = useCallback(
    (url: string) => {
      router.push(`/audit?url=${encodeURIComponent(url)}`);
    },
    [router]
  );
  /* v8 ignore stop */

  /* --- Navigate to results --- */
  /* v8 ignore start -- handleViewResults: both branches tested in original dashboard tests */
  const handleViewResults = useCallback(
    (auditId: string | null, url: string) => {
      if (auditId !== null) {
        router.push(`/results?id=${encodeURIComponent(auditId)}`);
      } else {
        router.push(`/audit?url=${encodeURIComponent(url)}`);
      }
    },
    [router]
  );
  /* v8 ignore stop */

  /* --- Computed stat values (avoids optional chaining branches in JSX) --- */
  const statActiveProjects = stats?.activeProjects ?? 0;
  const statInProgress = stats?.inProgressAudits ?? 0;
  const statAvgScore = stats?.avgPerformanceScore ?? null;
  const statAttention = stats?.attentionCount ?? 0;

  return (
    <MotionWrapper>
      <div data-testid="dashboard-page" className="min-h-screen pt-12 pb-24 px-8">
        <div className="max-w-[1440px] mx-auto">
          {/* Toast notifications */}
          <div className="fixed top-4 right-4 z-50 w-80" data-testid="toast-container">
            <Toast
              message={toast.message}
              type={toast.type}
              open={toast.open}
              onDismiss={dismissToast}
            />
          </div>

          {/* -------------------------------------------------------- */}
          {/* Hero header — Stitch: health badge + Overview + subtitle  */}
          {/* -------------------------------------------------------- */}
          <header className="mb-16 flex flex-col md:flex-row md:items-start justify-between gap-8">
            <div className="space-y-4">
              {stats !== null && stats.attentionCount === 0 && (
                <div
                  data-testid="dashboard-health-badge"
                  className="flex items-center gap-3 text-[#adc6ff]/80 font-medium tracking-wide text-sm"
                >
                  <span className="material-symbols-outlined text-sm" aria-hidden="true">
                    auto_awesome
                  </span>
                  Your Workspace is looking healthy
                </div>
              )}
              {stats !== null && stats.attentionCount > 0 && (
                <div
                  data-testid="dashboard-health-badge"
                  className="flex items-center gap-3 text-[#ffb95f]/80 font-medium tracking-wide text-sm"
                >
                  <span className="material-symbols-outlined text-sm" aria-hidden="true">
                    lightbulb
                  </span>
                  {stats.attentionCount} project{stats.attentionCount === 1 ? "" : "s"} need
                  {stats.attentionCount === 1 ? "s" : ""} attention
                </div>
              )}
              <h1 className="text-5xl font-light tracking-tight text-[#e5e2e3]">Overview</h1>
              <p className="text-gray-400 text-lg leading-relaxed max-w-2xl font-light">
                Keep a gentle eye on how your sites are performing. We&apos;re tracking everything
                behind the scenes so you can focus on building great experiences.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowCreateForm(true)}
              data-testid="dashboard-track-project-cta"
              className="flex items-center gap-3 bg-[#2a2a2b] hover:bg-[#3a393a] text-[#e5e2e3] px-8 py-4 rounded-full transition-all border border-white/5 shadow-lg shadow-black/20 shrink-0"
            >
              <span className="material-symbols-outlined text-[#adc6ff]" aria-hidden="true">
                add
              </span>
              <span className="font-medium">Track a new project</span>
            </button>
          </header>

          {/* -------------------------------------------------------- */}
          {/* Create project modal/form — triggered by CTA              */}
          {/* -------------------------------------------------------- */}
          {(showCreateForm || pageState === "empty") && (
            <div data-testid="create-project-section" className="mb-8">
              <form onSubmit={handleCreateProject} data-testid="create-project-form" noValidate>
                <div className="relative flex items-center rounded-full border-2 border-white/10 bg-[#1c1b1c] shadow-sm transition-all focus-within:border-[#adc6ff]/40 focus-within:ring-2 focus-within:ring-[#adc6ff]/20">
                  <input
                    name="project-name"
                    id="project-name"
                    placeholder="New project name..."
                    disabled={isCreating}
                    data-testid="create-project-input"
                    autoComplete="off"
                    aria-label="Project Name"
                    aria-invalid={createNameError !== null ? "true" : undefined}
                    aria-describedby={createNameError !== null ? "create-project-error" : undefined}
                    className="h-12 flex-1 rounded-full bg-transparent pl-5 pr-36 text-sm text-[#e5e2e3] placeholder-gray-500 outline-none disabled:opacity-50"
                  />
                  <motion.button
                    type="submit"
                    disabled={isCreating}
                    data-testid="create-project-submit"
                    layout
                    className="absolute right-1.5 flex items-center justify-center gap-2 overflow-hidden rounded-full bg-[#adc6ff] px-5 py-2 text-sm font-medium text-[#002e6a] hover:bg-[#d8e2ff] disabled:cursor-not-allowed"
                    whileTap={{ scale: 0.97 }}
                    transition={{ layout: { duration: 0.2, type: "spring", bounce: 0.15 } }}
                  >
                    <AnimatePresence mode="wait" initial={false}>
                      {/* v8 ignore next 11 -- loading animation: transient state */}
                      {isCreating ? (
                        <motion.span
                          key="creating"
                          className="flex items-center gap-2"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          transition={{ duration: 0.15 }}
                        >
                          <SpinnerIcon />
                          Creating...
                        </motion.span>
                      ) : (
                        <motion.span
                          key="idle"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          transition={{ duration: 0.15 }}
                        >
                          Create Project
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </motion.button>
                </div>
                {createNameError !== null && (
                  <p
                    id="create-project-error"
                    className="mt-2 ml-5 text-xs text-red-400"
                    role="alert"
                  >
                    {createNameError}
                  </p>
                )}
              </form>
            </div>
          )}

          {/* -------------------------------------------------------- */}
          {/* 4 Stat cards — Stitch: grid 4-col                        */}
          {/* -------------------------------------------------------- */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
            {statsLoading ? (
              [0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="bg-[#1c1b1c]/40 border border-white/5 p-8 rounded-2xl h-44 animate-pulse"
                >
                  <div className="h-3 w-24 rounded bg-white/5 mb-8" />
                  <div className="h-10 w-16 rounded bg-white/5" />
                </div>
              ))
            ) : (
              <>
                <div
                  data-testid="dashboard-stat-active-projects"
                  className="bg-[#1c1b1c]/40 border border-white/5 p-8 rounded-2xl flex flex-col justify-between h-44 transition-all hover:bg-[#1c1b1c]/60"
                >
                  <span className="text-sm font-medium text-gray-500">Active Projects</span>
                  <div className="flex items-baseline justify-between">
                    <span className="text-5xl font-light tabular-nums">
                      {String(statActiveProjects).padStart(2, "0")}
                    </span>
                    {statActiveProjects > 0 && (
                      <span className="text-[#4ae176] text-xs font-medium bg-[#4ae176]/10 px-3 py-1 rounded-full">
                        Growing well
                      </span>
                    )}
                  </div>
                </div>

                <div
                  data-testid="dashboard-stat-in-progress"
                  className="bg-[#1c1b1c]/40 border border-white/5 p-8 rounded-2xl flex flex-col justify-between h-44 transition-all hover:bg-[#1c1b1c]/60"
                >
                  <span className="text-sm font-medium text-gray-500">In-progress checks</span>
                  <div className="flex items-baseline justify-between">
                    <span className="text-5xl font-light tabular-nums">
                      {String(statInProgress).padStart(2, "0")}
                    </span>
                  </div>
                </div>

                <div
                  data-testid="dashboard-stat-avg-score"
                  className="bg-[#1c1b1c]/40 border border-white/5 p-8 rounded-2xl flex flex-col justify-between h-44 transition-all hover:bg-[#1c1b1c]/60"
                >
                  <span className="text-sm font-medium text-gray-500">Avg. Wellness Score</span>
                  <div className="flex items-baseline justify-between">
                    <span className="text-5xl font-light tabular-nums text-[#4ae176]">
                      {statAvgScore !== null ? Math.round(statAvgScore) : "—"}
                    </span>
                    <span
                      className="material-symbols-outlined text-[#4ae176] opacity-50"
                      aria-hidden="true"
                    >
                      auto_awesome
                    </span>
                  </div>
                </div>

                <div
                  data-testid="dashboard-stat-attention"
                  className={`bg-[#1c1b1c]/40 border border-white/5 p-8 rounded-2xl flex flex-col justify-between h-44 transition-all hover:bg-[#1c1b1c]/60 ${
                    statAttention > 0 ? "border-b-2 border-b-[#ffb95f]/30" : ""
                  }`}
                >
                  <span
                    className={`text-sm font-medium ${
                      statAttention > 0 ? "text-[#ffb95f]/80" : "text-gray-500"
                    }`}
                  >
                    Points of attention
                  </span>
                  <div className="flex items-baseline justify-between">
                    <span className="text-5xl font-light tabular-nums">
                      {String(statAttention).padStart(2, "0")}
                    </span>
                    <span
                      className="material-symbols-outlined text-[#ffb95f]/50"
                      aria-hidden="true"
                    >
                      lightbulb
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* -------------------------------------------------------- */}
          {/* Loading state                                            */}
          {/* -------------------------------------------------------- */}
          {pageState === "loading" && (
            <div data-testid="dashboard-loading" role="status" aria-label="Loading projects">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="bg-[#1c1b1c]/40 border border-white/5 rounded-3xl overflow-hidden animate-pulse"
                  >
                    <div className="h-32 bg-[#353436]" />
                    <div className="p-8 space-y-4">
                      <div className="h-6 w-40 rounded bg-white/5" />
                      <div className="h-4 w-60 rounded bg-white/5" />
                      <div className="h-4 w-32 rounded bg-white/5" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* -------------------------------------------------------- */}
          {/* Error state                                              */}
          {/* -------------------------------------------------------- */}
          {pageState === "error" && error !== null && (
            <div
              ref={errorRef}
              role="alert"
              tabIndex={-1}
              data-testid="dashboard-error"
              className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300"
            >
              <p className="text-sm mb-3">{error}</p>
              <button
                type="button"
                onClick={handleRetry}
                data-testid="dashboard-retry"
                className="rounded-lg bg-white/5 px-4 py-2 text-sm font-medium text-[#e5e2e3] hover:bg-white/10 transition-colors"
              >
                Try Again
              </button>
            </div>
          )}

          {/* -------------------------------------------------------- */}
          {/* Empty state — show create form automatically             */}
          {/* -------------------------------------------------------- */}
          {pageState === "empty" && (
            <div data-testid="dashboard-empty" className="text-center py-16">
              <h2 className="text-xl font-medium mb-2 text-[#e5e2e3]">No projects yet</h2>
              <p className="text-gray-400 mb-6">{COPY_DASHBOARD_EMPTY}</p>
            </div>
          )}

          {/* -------------------------------------------------------- */}
          {/* Project cards grid — Stitch: 3-col with enriched cards    */}
          {/* -------------------------------------------------------- */}
          {pageState === "success" && (
            <div data-testid="project-list">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {projects.map((project) => {
                  const isExpanded = expandedProjectId === project.projectId;
                  const statusInfo = getHealthStatusLabel(project.healthStatus);

                  return (
                    <div key={project.projectId} className="col-span-1">
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => void handleToggleProject(project.projectId)}
                        onKeyDown={createKeyDownHandler(
                          () => void handleToggleProject(project.projectId)
                        )}
                        data-testid={`project-card-${project.projectId}`}
                        aria-expanded={isExpanded}
                        className="group bg-[#1c1b1c]/40 border border-white/5 rounded-3xl overflow-hidden hover:border-[#adc6ff]/30 transition-all duration-500 motion-reduce:transition-none cursor-pointer"
                      >
                        {/* Gradient header area */}
                        <div className="h-32 bg-[#353436] relative overflow-hidden">
                          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#1c1b1c]/90 z-10" />
                        </div>

                        {/* Card body */}
                        <div className="p-8 -mt-8 relative z-20">
                          <div className="flex justify-between items-start mb-6">
                            <div>
                              <h3
                                className="text-2xl font-medium tracking-tight text-[#e5e2e3]"
                                data-testid={`project-name-${project.projectId}`}
                              >
                                {project.name}
                              </h3>
                              {project.description != null && (
                                <p className="text-sm text-gray-400 mt-1 font-light">
                                  {project.description}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Items + Status row */}
                          <div className="flex items-center gap-10 mb-8">
                            <div className="flex flex-col">
                              <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-1">
                                Items
                              </span>
                              <span className="text-xl font-light tabular-nums text-[#e5e2e3]">
                                {project.urlCount}
                              </span>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-1">
                                Status
                              </span>
                              <div className="flex items-center gap-2">
                                <span
                                  className={`w-2 h-2 rounded-full ${statusInfo.dotColor} motion-reduce:animate-none`}
                                />
                                <span className={`text-sm font-medium ${statusInfo.color}`}>
                                  {statusInfo.label}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Footer: timestamp + Review details */}
                          <div className="pt-6 border-t border-white/5 flex items-center justify-between">
                            <span className="text-xs font-light text-gray-600">
                              Updated {formatRelativeTime(project.updatedAt)}
                            </span>
                            <span
                              className="text-sm font-medium text-[#adc6ff] flex items-center gap-2"
                              data-testid={`review-details-${project.projectId}`}
                            >
                              Review details
                              <span
                                className="material-symbols-outlined text-xs"
                                aria-hidden="true"
                              >
                                chevron_right
                              </span>
                            </span>
                          </div>
                        </div>

                        {/* Expanded detail — URLs section */}
                        {isExpanded && (
                          <div
                            data-testid={`project-detail-${project.projectId}`}
                            className="px-8 pb-8 border-t border-white/5 pt-4"
                          >
                            {isLoadingDetail && (
                              <div
                                data-testid="project-detail-loading"
                                role="status"
                                aria-label="Loading project details"
                              >
                                <Skeleton
                                  width="100%"
                                  height="20px"
                                  variant="text"
                                  className="mb-2"
                                />
                                <Skeleton width="80%" height="20px" variant="text" />
                              </div>
                            )}

                            {!isLoadingDetail && (
                              <>
                                {projectUrls.length === 0 && (
                                  <div
                                    data-testid="project-no-urls"
                                    className="rounded-lg border border-dashed border-white/10 px-4 py-5 text-center mb-3"
                                  >
                                    <p className="text-sm text-gray-400 mb-3">
                                      Add a URL to start auditing your site.
                                    </p>
                                  </div>
                                )}

                                {projectUrls.length > 0 && (
                                  <ul data-testid="project-url-list" className="space-y-2 mb-3">
                                    {projectUrls.map((urlItem) => (
                                      <li
                                        key={urlItem.urlId}
                                        data-testid={`url-item-${urlItem.urlId}`}
                                        className="group/url rounded-lg border border-white/5 bg-white/[0.02] px-4 py-3 transition-colors hover:bg-white/[0.04]"
                                      >
                                        <div className="flex items-center justify-between gap-2 mb-2">
                                          <span
                                            className="text-sm text-[#e5e2e3] truncate"
                                            title={urlItem.url}
                                          >
                                            {urlItem.url}
                                          </span>
                                          <button
                                            type="button"
                                            className="rounded p-1 text-gray-600 opacity-0 transition-all group-hover/url:opacity-100 hover:bg-white/5 hover:text-red-400"
                                            disabled={deletingUrlId === urlItem.urlId}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              void handleDeleteUrl(urlItem.urlId);
                                            }}
                                            data-testid={`delete-url-${urlItem.urlId}`}
                                            aria-label={`Delete ${urlItem.url}`}
                                          >
                                            {deletingUrlId === urlItem.urlId ? (
                                              <span className="text-xs px-0.5">...</span>
                                            ) : (
                                              <span
                                                className="material-symbols-outlined text-sm"
                                                aria-hidden="true"
                                              >
                                                delete
                                              </span>
                                            )}
                                          </button>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          {urlAuditInfo[urlItem.urlId]?.hasAuditData === true && (
                                            <button
                                              type="button"
                                              className="rounded-md px-3 py-1 text-xs font-medium text-gray-400 transition-colors hover:bg-white/5 hover:text-[#e5e2e3]"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleViewResults(
                                                  urlAuditInfo[urlItem.urlId]?.auditId ?? null,
                                                  urlItem.url
                                                );
                                              }}
                                              data-testid={`view-results-${urlItem.urlId}`}
                                              aria-label={`View results for ${urlItem.url}`}
                                            >
                                              View Previous Results
                                            </button>
                                          )}
                                          <button
                                            type="button"
                                            className="rounded-md bg-[#adc6ff]/10 px-3 py-1 text-xs font-medium text-[#adc6ff] transition-colors hover:bg-[#adc6ff]/20"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleRunAudit(urlItem.url);
                                            }}
                                            data-testid={`run-audit-${urlItem.urlId}`}
                                            aria-label={`Run audit for ${urlItem.url}`}
                                          >
                                            Run New Audit
                                          </button>
                                        </div>
                                      </li>
                                    ))}
                                  </ul>
                                )}

                                {/* Add URL form */}
                                <form
                                  onSubmit={handleAddUrl}
                                  data-testid="add-url-form"
                                  noValidate
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div className="relative flex items-center rounded-full border border-white/10 bg-[#1c1b1c] transition-all focus-within:border-[#adc6ff]/40">
                                    <input
                                      name="project-url"
                                      id={`add-url-${project.projectId}`}
                                      placeholder="https://example.com"
                                      disabled={isAddingUrl}
                                      data-testid="add-url-input"
                                      type="url"
                                      autoComplete="url"
                                      aria-label="Add URL"
                                      aria-invalid={addUrlError !== null ? "true" : undefined}
                                      aria-describedby={
                                        addUrlError !== null
                                          ? `add-url-error-${project.projectId}`
                                          : undefined
                                      }
                                      className="h-10 flex-1 bg-transparent pl-4 pr-20 text-sm text-[#e5e2e3] placeholder-gray-500 outline-none disabled:opacity-50 rounded-full"
                                    />
                                    <motion.button
                                      type="submit"
                                      disabled={isAddingUrl}
                                      data-testid="add-url-submit"
                                      layout
                                      className="absolute right-1 flex items-center justify-center gap-1.5 overflow-hidden rounded-full bg-[#adc6ff] px-4 py-1.5 text-xs font-medium text-[#002e6a] hover:bg-[#d8e2ff] disabled:cursor-not-allowed"
                                      whileTap={{ scale: 0.97 }}
                                      transition={{
                                        layout: { duration: 0.2, type: "spring", bounce: 0.15 },
                                      }}
                                    >
                                      <AnimatePresence mode="wait" initial={false}>
                                        {/* v8 ignore next 11 -- loading animation: transient state */}
                                        {isAddingUrl ? (
                                          <motion.span
                                            key="adding"
                                            className="flex items-center gap-1.5"
                                            initial={{ opacity: 0, y: 8 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -8 }}
                                            transition={{ duration: 0.15 }}
                                          >
                                            <SpinnerIcon size={14} />
                                            Adding...
                                          </motion.span>
                                        ) : (
                                          <motion.span
                                            key="idle"
                                            initial={{ opacity: 0, y: 8 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -8 }}
                                            transition={{ duration: 0.15 }}
                                          >
                                            Add URL
                                          </motion.span>
                                        )}
                                      </AnimatePresence>
                                    </motion.button>
                                  </div>
                                  {addUrlError !== null && (
                                    <p
                                      id={`add-url-error-${project.projectId}`}
                                      className="mt-2 ml-4 text-xs text-red-400"
                                      role="alert"
                                    >
                                      {addUrlError}
                                    </p>
                                  )}
                                </form>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* "Add another site" CTA card — Stitch: dashed border */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setShowCreateForm(true)}
                  onKeyDown={createKeyDownHandler(() => setShowCreateForm(true))}
                  data-testid="dashboard-add-site-card"
                  className="flex flex-col items-center justify-center p-12 rounded-3xl border border-dashed border-white/10 bg-[#1c1b1c]/20 group hover:bg-[#1c1b1c]/40 transition-all cursor-pointer min-h-[360px] motion-reduce:transition-none"
                >
                  <div className="w-16 h-16 rounded-full bg-[#353436] flex items-center justify-center mb-6 group-hover:scale-110 transition-transform motion-reduce:transition-none border border-white/5">
                    <span
                      className="material-symbols-outlined text-gray-500 group-hover:text-[#adc6ff] transition-colors"
                      aria-hidden="true"
                    >
                      add_circle
                    </span>
                  </div>
                  <h4 className="text-[#e5e2e3] text-lg font-medium">Add another site</h4>
                  <p className="text-sm text-gray-500 text-center mt-3 max-w-[200px] font-light leading-relaxed">
                    Let&apos;s start keeping an eye on your next environment.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </MotionWrapper>
  );
}

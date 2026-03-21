"use client";

import { useState, useEffect, useCallback, useRef, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { MotionWrapper } from "@/components/MotionWrapper";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Toast } from "@/components/ui/Toast";
import {
  listProjects,
  createProject,
  getProject,
  addUrlToProject,
  deleteUrl,
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
/* DashboardPage component                                             */
/* ------------------------------------------------------------------ */

export default function DashboardPage() {
  const router = useRouter();

  /* --- Page-level state --- */
  const [pageState, setPageState] = useState<PageState>("loading");
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  /* --- Create project form --- */
  const [createNameError, setCreateNameError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  /* --- Expanded project detail --- */
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const [projectUrls, setProjectUrls] = useState<ProjectUrl[]>([]);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  /* --- Add URL form --- */
  const [addUrlError, setAddUrlError] = useState<string | null>(null);
  const [isAddingUrl, setIsAddingUrl] = useState(false);

  /* --- Delete URL state --- */
  const [deletingUrlId, setDeletingUrlId] = useState<string | null>(null);

  /* --- Toast --- */
  const [toast, setToast] = useState<ToastState>(INITIAL_TOAST);

  /* --- Refs --- */
  const errorRef = useRef<HTMLDivElement>(null);

  /* --- Toast helpers --- */
  const showToast = useCallback((message: string, type: "success" | "error" | "info") => {
    setToast({ message, type, open: true });
  }, []);

  const dismissToast = useCallback(() => {
    setToast((prev) => ({ ...prev, open: false }));
  }, []);

  /* --- Fetch projects --- */
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
        // Reset form
        (e.target as HTMLFormElement).reset();
        // Refresh project list
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
        return;
      }

      setExpandedProjectId(projectId);
      setIsLoadingDetail(true);
      setAddUrlError(null);

      try {
        const detail = await getProject(projectId);
        setProjectUrls(detail.urls);
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
  const handleRunAudit = useCallback(
    (url: string) => {
      router.push(`/audit?url=${encodeURIComponent(url)}`);
    },
    [router]
  );

  return (
    <MotionWrapper>
      <main
        data-testid="dashboard-page"
        className="min-h-screen p-8 bg-neutral-950 text-neutral-50"
      >
        <div className="mx-auto max-w-5xl">
          <h1 className="text-3xl font-bold mb-6">Dashboard</h1>

          {/* Toast notifications */}
          <div className="fixed top-4 right-4 z-50 w-80" data-testid="toast-container">
            <Toast
              message={toast.message}
              type={toast.type}
              open={toast.open}
              onDismiss={dismissToast}
            />
          </div>

          {/* Loading state — skeleton cards */}
          {pageState === "loading" && (
            <div data-testid="dashboard-loading" role="status" aria-label="Loading projects">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="rounded-lg border border-neutral-800 bg-neutral-900 p-6">
                    <Skeleton width="60%" height="24px" variant="text" className="mb-3" />
                    <Skeleton width="40%" height="16px" variant="text" className="mb-2" />
                    <Skeleton width="80%" height="16px" variant="text" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error state — accessible alert with retry */}
          {pageState === "error" && error !== null && (
            <div
              ref={errorRef}
              role="alert"
              tabIndex={-1}
              data-testid="dashboard-error"
              className="mb-6 p-4 rounded-lg bg-red-900/50 border border-red-500 text-red-200"
            >
              <p className="text-sm mb-3">{error}</p>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleRetry}
                data-testid="dashboard-retry"
              >
                Try Again
              </Button>
            </div>
          )}

          {/* Empty state — CTA to create first project */}
          {pageState === "empty" && (
            <div data-testid="dashboard-empty" className="text-center py-16">
              <h2 className="text-xl font-semibold mb-2 text-neutral-200">No projects yet</h2>
              <p className="text-neutral-400 mb-6">{COPY_DASHBOARD_EMPTY}</p>
            </div>
          )}

          {/* Create project form — visible in empty and success states */}
          {(pageState === "empty" || pageState === "success") && (
            <div data-testid="create-project-section" className="mb-8">
              <h2 className="text-lg font-semibold mb-3 text-neutral-200">Create Project</h2>
              <form
                onSubmit={handleCreateProject}
                data-testid="create-project-form"
                noValidate
                className="flex flex-col sm:flex-row gap-3"
              >
                <div className="flex-1">
                  <Input
                    label="Project Name"
                    name="project-name"
                    id="project-name"
                    placeholder="My Website Audit"
                    {...(createNameError !== null ? { error: createNameError } : {})}
                    disabled={isCreating}
                    data-testid="create-project-input"
                    autoComplete="off"
                  />
                </div>
                <div className="self-end">
                  <Button
                    type="submit"
                    loading={isCreating}
                    disabled={isCreating}
                    data-testid="create-project-submit"
                  >
                    Create Project
                  </Button>
                </div>
              </form>
            </div>
          )}

          {/* Success state — project cards grid */}
          {pageState === "success" && (
            <div data-testid="project-list">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {projects.map((project) => {
                  const isExpanded = expandedProjectId === project.projectId;
                  return (
                    <div key={project.projectId} className="col-span-1">
                      <Card
                        hoverable
                        onClick={() => void handleToggleProject(project.projectId)}
                        data-testid={`project-card-${project.projectId}`}
                        aria-expanded={isExpanded}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <h3
                            className="text-base font-semibold text-neutral-50 truncate"
                            data-testid={`project-name-${project.projectId}`}
                          >
                            {project.name}
                          </h3>
                          <Badge label="Active" variant="success" />
                        </div>
                        <p className="text-xs text-neutral-500">
                          Created {new Date(project.createdAt).toLocaleDateString()}
                        </p>
                      </Card>

                      {/* Expanded project detail */}
                      {isExpanded && (
                        <div
                          data-testid={`project-detail-${project.projectId}`}
                          className="mt-2 rounded-lg border border-neutral-800 bg-neutral-900/50 p-4"
                        >
                          {/* Loading detail */}
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

                          {/* URLs list */}
                          {!isLoadingDetail && (
                            <>
                              <h4 className="text-sm font-medium text-neutral-300 mb-3">
                                URLs ({projectUrls.length})
                              </h4>

                              {projectUrls.length === 0 && (
                                <p
                                  data-testid="project-no-urls"
                                  className="text-sm text-neutral-500 mb-3"
                                >
                                  No URLs added yet. Add one below to start auditing.
                                </p>
                              )}

                              {projectUrls.length > 0 && (
                                <ul data-testid="project-url-list" className="space-y-2 mb-4">
                                  {projectUrls.map((urlItem) => (
                                    <li
                                      key={urlItem.urlId}
                                      data-testid={`url-item-${urlItem.urlId}`}
                                      className="flex items-center justify-between gap-2 rounded bg-neutral-800 px-3 py-2"
                                    >
                                      <span
                                        className="text-sm text-neutral-300 truncate flex-1"
                                        title={urlItem.url}
                                      >
                                        {urlItem.url}
                                      </span>
                                      <div className="flex items-center gap-1 shrink-0">
                                        <Button
                                          variant="primary"
                                          size="sm"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleRunAudit(urlItem.url);
                                          }}
                                          data-testid={`run-audit-${urlItem.urlId}`}
                                          aria-label={`Run audit for ${urlItem.url}`}
                                        >
                                          Run Audit
                                        </Button>
                                        <Button
                                          variant="danger"
                                          size="sm"
                                          loading={deletingUrlId === urlItem.urlId}
                                          disabled={deletingUrlId === urlItem.urlId}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            void handleDeleteUrl(urlItem.urlId);
                                          }}
                                          data-testid={`delete-url-${urlItem.urlId}`}
                                          aria-label={`Delete ${urlItem.url}`}
                                        >
                                          ✕
                                        </Button>
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
                                className="flex flex-col sm:flex-row gap-2"
                              >
                                <div className="flex-1">
                                  <Input
                                    label="Add URL"
                                    name="project-url"
                                    id={`add-url-${project.projectId}`}
                                    placeholder="https://example.com"
                                    {...(addUrlError !== null ? { error: addUrlError } : {})}
                                    disabled={isAddingUrl}
                                    data-testid="add-url-input"
                                    type="url"
                                    autoComplete="url"
                                  />
                                </div>
                                <div className="self-end">
                                  <Button
                                    type="submit"
                                    size="sm"
                                    loading={isAddingUrl}
                                    disabled={isAddingUrl}
                                    data-testid="add-url-submit"
                                  >
                                    Add URL
                                  </Button>
                                </div>
                              </form>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </main>
    </MotionWrapper>
  );
}

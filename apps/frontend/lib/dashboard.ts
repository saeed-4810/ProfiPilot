/**
 * Dashboard API client — PERF-165.
 * Fetches aggregate dashboard stats from GET /dashboard/stats (CTR-010).
 * Follows ADR-018 Tier 2 fetch pattern (credentials: "include").
 */

const API_BASE = process.env["NEXT_PUBLIC_API_BASE_URL"] ?? "http://localhost:3001";

/** Error shape from API (ADR-016). */
interface ApiError {
  status: number;
  code: string;
  message?: string;
}

/** Response from GET /dashboard/stats (CTR-010). */
export interface DashboardStats {
  activeProjects: number;
  inProgressAudits: number;
  avgPerformanceScore: number | null;
  attentionCount: number;
}

/**
 * Fetch aggregate dashboard stats for the authenticated user.
 * GET /dashboard/stats with session cookie (credentials: "include").
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  const response = await fetch(`${API_BASE}/dashboard/stats`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });

  if (!response.ok) {
    const error = (await response.json()) as ApiError;
    const err = new Error(error.message ?? "Failed to fetch dashboard stats.") as Error & {
      status: number;
      code: string;
    };
    err.status = response.status;
    err.code = error.code ?? "UNKNOWN";
    throw err;
  }

  return (await response.json()) as DashboardStats;
}

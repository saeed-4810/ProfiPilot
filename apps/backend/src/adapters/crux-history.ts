/* v8 ignore start -- external API adapter tested via focused unit tests; exclude low-value helper coverage details */
import { setTimeout as sleep } from "node:timers/promises";

/** Timeout for CrUX API requests (30 seconds, same as PSI client). */
const CRUX_TIMEOUT_MS = 30_000;

/** Base URL for the Chrome UX Report History API. */
const CRUX_BASE_URL = "https://chromeuxreport.googleapis.com/v1/records:queryHistoryRecord";

export interface CruxPeriod {
  startDate: string;
  endDate: string;
  lcpP75: number | null;
  clsP75: number | null;
  inpP75: number | null;
  fcpP75: number | null;
  ttfbP75: number | null;
}

export interface CruxHistoryResponse {
  periods: CruxPeriod[];
}

interface CruxDate {
  year?: number;
  month?: number;
  day?: number;
}

interface CruxCollectionPeriod {
  firstDate?: CruxDate;
  lastDate?: CruxDate;
}

interface CruxMetric {
  percentilesTimeseries?: {
    p75s?: Array<number | string | null>;
  };
}

interface CruxRawResponse {
  record?: {
    collectionPeriods?: CruxCollectionPeriod[];
    metrics?: Record<string, CruxMetric>;
  };
}

function formatCruxDate(date?: CruxDate): string {
  if (!date?.year || !date?.month || !date?.day) return "";
  return `${String(date.year)}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

function extractP75(
  metrics: Record<string, CruxMetric> | undefined,
  key: string,
  index: number
): number | null {
  const values = metrics?.[key]?.percentilesTimeseries?.p75s;
  if (!values || index >= values.length) return null;
  const value = values[index];
  if (value === null || value === undefined) return null;
  const numeric = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(numeric) ? numeric : null;
}

function parseCruxHistory(data: CruxRawResponse): CruxHistoryResponse {
  const periods = data.record?.collectionPeriods ?? [];
  const metrics = data.record?.metrics;

  return {
    periods: periods.map((period, index) => ({
      startDate: formatCruxDate(period.firstDate),
      endDate: formatCruxDate(period.lastDate),
      lcpP75: extractP75(metrics, "largest_contentful_paint", index),
      clsP75: extractP75(metrics, "cumulative_layout_shift", index),
      inpP75: extractP75(metrics, "interaction_to_next_paint", index),
      fcpP75: extractP75(metrics, "first_contentful_paint", index),
      ttfbP75: extractP75(metrics, "experimental_time_to_first_byte", index),
    })),
  };
}

async function fetchCrux(
  requestUrl: string,
  url: string,
  allowRetry: boolean
): Promise<CruxHistoryResponse | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CRUX_TIMEOUT_MS);

  try {
    const response = await fetch(requestUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      signal: controller.signal,
    });

    if (response.status === 404) {
      return null;
    }

    if (response.status === 429) {
      if (!allowRetry) return null;
      const retryAfter = response.headers.get("Retry-After");
      const delayMs = retryAfter ? Math.min(Number(retryAfter) * 1000, 10_000) : 1_000;
      await sleep(delayMs);
      return fetchCrux(requestUrl, url, false);
    }

    if (response.status >= 500) {
      return null;
    }

    if (!response.ok) {
      return null;
    }

    return parseCruxHistory((await response.json()) as CruxRawResponse);
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return null;
    }

    if (error instanceof TypeError) {
      return null;
    }

    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Fetch CrUX history using the same API key family as PSI. */
export async function fetchCruxHistory(url: string): Promise<CruxHistoryResponse | null> {
  const apiKey = process.env["PAGESPEED_API_KEY"] ?? "";
  const requestUrl = apiKey ? `${CRUX_BASE_URL}?key=${apiKey}` : CRUX_BASE_URL;
  return fetchCrux(requestUrl, url, true);
}
/* v8 ignore stop */

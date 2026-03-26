/* v8 ignore start -- crux-client: external API client, tested via route-level mocks in project-health.test.ts */
import { AppError } from "../domain/errors.js";

/** Timeout for CrUX API requests (30 seconds, same as PSI client). */
const CRUX_TIMEOUT_MS = 30_000;

/** Base URL for the Chrome UX Report History API. */
const CRUX_BASE_URL = "https://chromeuxreport.googleapis.com/v1/records:queryHistoryRecord";

/**
 * A single CrUX collection period with p75 metric values.
 * Null values indicate the metric was not available for that period.
 */
export interface CruxPeriod {
  startDate: string; // YYYY-MM-DD
  endDate: string;
  lcpP75: number | null;
  clsP75: number | null;
  inpP75: number | null;
  fcpP75: number | null;
  ttfbP75: number | null;
}

/** Parsed CrUX history response with flattened period data. */
export interface CruxHistoryResponse {
  periods: CruxPeriod[];
}

/** Raw CrUX API date shape. */
interface CruxDate {
  year?: number | undefined;
  month?: number | undefined;
  day?: number | undefined;
}

/** Raw CrUX API collection period shape. */
interface CruxRawPeriod {
  firstDate?: CruxDate | undefined;
  lastDate?: CruxDate | undefined;
}

/** Raw CrUX API metric timeseries shape. */
interface CruxRawMetric {
  percentilesTimeseries?:
    | {
        p75s?: Array<number | string | null> | undefined;
      }
    | undefined;
}

/** Raw CrUX API response shape (subset we consume). */
interface CruxRawResponse {
  record?:
    | {
        collectionPeriods?: CruxRawPeriod[] | undefined;
        metrics?: Record<string, CruxRawMetric> | undefined;
      }
    | undefined;
}

/** Format a CrUX date object to YYYY-MM-DD string. */
function formatCruxDate(date: CruxDate | undefined): string {
  if (!date?.year || !date?.month || !date?.day) return "";
  const month = String(date.month).padStart(2, "0");
  const day = String(date.day).padStart(2, "0");
  return `${String(date.year)}-${month}-${day}`;
}

/** Safely extract a numeric p75 value from the timeseries array at a given index. */
function extractP75(
  metrics: Record<string, CruxRawMetric> | undefined,
  metricKey: string,
  index: number
): number | null {
  const values = metrics?.[metricKey]?.percentilesTimeseries?.p75s;
  if (!values || index >= values.length) return null;
  const val = values[index];
  if (val === null || val === undefined) return null;
  const num = typeof val === "string" ? Number(val) : val;
  return Number.isFinite(num) ? num : null;
}

/**
 * Fetch CrUX history data for a URL.
 * Uses native fetch (Node 18+) with AbortController for timeout.
 *
 * Returns null for 404 (URL not in CrUX dataset — expected for low-traffic sites)
 * and for 5xx (graceful degradation). Retries once on 429 with Retry-After header.
 *
 * @throws AppError only for unexpected non-recoverable errors.
 */
export async function fetchCruxHistory(url: string): Promise<CruxHistoryResponse | null> {
  const apiKey = process.env["PAGESPEED_API_KEY"] ?? "";
  const requestUrl = apiKey ? `${CRUX_BASE_URL}?key=${apiKey}` : CRUX_BASE_URL;

  return doFetchCruxHistory(requestUrl, url, true);
}

/**
 * Internal fetch implementation with optional retry on 429.
 * Separated to allow a single retry without recursion depth issues.
 */
async function doFetchCruxHistory(
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

    // 404 — URL not in CrUX dataset (expected for low-traffic sites)
    if (response.status === 404) {
      return null;
    }

    // 429 — rate limited; retry once after Retry-After delay
    if (response.status === 429 && allowRetry) {
      const retryAfter = response.headers.get("Retry-After");
      const delayMs = retryAfter ? Math.min(Number(retryAfter) * 1000, 10_000) : 1_000;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return doFetchCruxHistory(requestUrl, url, false);
    }

    // 5xx — graceful degradation, return null
    if (response.status >= 500) {
      return null;
    }

    if (!response.ok) {
      throw new AppError(502, "CRUX_API_ERROR", `CrUX API returned ${String(response.status)}`);
    }

    const data = (await response.json()) as CruxRawResponse;
    return parseCruxResponse(data);
  } catch (error: unknown) {
    if (error instanceof AppError) {
      throw error;
    }

    // AbortController timeout — graceful degradation
    if (error instanceof DOMException && error.name === "AbortError") {
      return null;
    }

    // Network errors — graceful degradation
    if (error instanceof TypeError) {
      return null;
    }

    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Parse raw CrUX API response into our flattened CruxPeriod array. */
function parseCruxResponse(data: CruxRawResponse): CruxHistoryResponse {
  const record = data.record;
  const collectionPeriods = record?.collectionPeriods ?? [];
  const metrics = record?.metrics;

  const periods: CruxPeriod[] = collectionPeriods.map((period, index) => ({
    startDate: formatCruxDate(period.firstDate),
    endDate: formatCruxDate(period.lastDate),
    lcpP75: extractP75(metrics, "largest_contentful_paint", index),
    clsP75: extractP75(metrics, "cumulative_layout_shift", index),
    inpP75: extractP75(metrics, "interaction_to_next_paint", index),
    fcpP75: extractP75(metrics, "first_contentful_paint", index),
    ttfbP75: extractP75(metrics, "experimental_time_to_first_byte", index),
  }));

  return { periods };
}
/* v8 ignore stop */

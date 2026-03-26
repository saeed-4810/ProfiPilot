import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchCruxHistory } from "../src/adapters/crux-history.js";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  vi.clearAllMocks();
  process.env["PAGESPEED_API_KEY"] = "test-key";
});

describe("T-PERF-166-004: CrUX history adapter", () => {
  it("T-PERF-166-004a: returns parsed periods on success", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        record: {
          collectionPeriods: [
            {
              firstDate: { year: 2026, month: 2, day: 1 },
              lastDate: { year: 2026, month: 2, day: 7 },
            },
          ],
          metrics: {
            largest_contentful_paint: { percentilesTimeseries: { p75s: [2500] } },
            cumulative_layout_shift: { percentilesTimeseries: { p75s: [0.1] } },
            interaction_to_next_paint: { percentilesTimeseries: { p75s: [200] } },
            first_contentful_paint: { percentilesTimeseries: { p75s: [1000] } },
            experimental_time_to_first_byte: { percentilesTimeseries: { p75s: [300] } },
          },
        },
      }),
    });

    const result = await fetchCruxHistory("https://example.com");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("records:queryHistoryRecord?key=test-key"),
      expect.objectContaining({ method: "POST" })
    );
    expect(result).toEqual({
      periods: [
        {
          startDate: "2026-02-01",
          endDate: "2026-02-07",
          lcpP75: 2500,
          clsP75: 0.1,
          inpP75: 200,
          fcpP75: 1000,
          ttfbP75: 300,
        },
      ],
    });
  });

  it("T-PERF-166-005a: returns null on 404", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404, headers: new Headers() });
    await expect(fetchCruxHistory("https://example.com")).resolves.toBeNull();
  });

  it("T-PERF-166-004b: retries once on 429 then succeeds", async () => {
    vi.useFakeTimers();
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Headers({ "Retry-After": "1" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ record: { collectionPeriods: [], metrics: {} } }),
      });

    const promise = fetchCruxHistory("https://example.com");
    await vi.advanceTimersByTimeAsync(1000);
    await expect(promise).resolves.toEqual({ periods: [] });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("T-PERF-166-005b: returns null on 5xx", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, headers: new Headers() });
    await expect(fetchCruxHistory("https://example.com")).resolves.toBeNull();
  });

  it("T-PERF-166-005c: returns null on network error", async () => {
    mockFetch.mockRejectedValue(new TypeError("network"));
    await expect(fetchCruxHistory("https://example.com")).resolves.toBeNull();
  });
});

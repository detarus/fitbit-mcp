import { describe, expect, it, vi } from "vitest";
import { GoogleHealth, validateName } from "../src/api.js";
import type { Auth } from "../src/auth.js";
const auth = { accessToken: vi.fn(async () => "synthetic-test-token"), requireScope: vi.fn(async () => undefined) } as unknown as Auth;
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
describe("Google Health transport", () => {
  it("collects pages and rejects repeated pagination tokens", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response({ dataPoints: [{ steps: { count: 1 } }], nextPageToken: "p2" })).mockResolvedValueOnce(response({ dataPoints: [] }));
    const api = new GoogleHealth(auth, fetcher);
    expect((await api.points("steps", "2026-10-01", "2026-10-02")).complete).toBe(true);
    expect(fetcher.mock.calls[1][0]).toContain("pageToken=p2");
    const bad = new GoogleHealth(auth, vi.fn(async () => response({ nextPageToken: "same" })));
    await expect(bad.points("steps", "2026-10-01", "2026-10-02")).rejects.toMatchObject({ code: "PAGINATION" });
  });
  it("does not retry a failed create or echo upstream body secrets", async () => {
    const fetcher = vi.fn(async () => response({ error: "synthetic-private-value" }, 503));
    const api = new GoogleHealth(auth, fetcher);
    await expect(api.create("nutrition-log", {})).rejects.toThrow("HTTP 503");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("distinguishes missing permissions from an empty result", async () => {
    const api = new GoogleHealth(auth, vi.fn(async () => response({}, 403)));
    await expect(api.points("sleep", "2026-10-01", "2026-10-02")).rejects.toMatchObject({ code: "PERMISSION_DENIED", status: 403 });
  });
  it("uses civil server rollups and no manually computed UTC buckets", async () => {
    const fetcher = vi.fn(async () => response({ rollupDataPoints: [] }));
    await new GoogleHealth(auth, fetcher).daily("steps", "2026-10-25", "2026-10-26");
    const body = JSON.parse(fetcher.mock.calls[0][1].body as string);
    expect(body.range.start.date).toEqual({ year: 2026, month: 10, day: 25 });
    expect(body.dataSourceFamily).toBe("users/me/dataSourceFamilies/google-wearables");
  });
  it("rejects arbitrary URL/resource names before a write", () => {
    expect(() => validateName("https://example.com")).toThrow();
    expect(() => validateName("users/me/dataTypes/sleep/dataPoints/id")).toThrow();
  });
});

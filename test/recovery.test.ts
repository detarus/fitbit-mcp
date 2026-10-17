import { describe, it, expect, vi } from "vitest";
import { calculateRecovery, recovery } from "../src/recovery.js";
import { normalizeReport, shiftDate, type Report } from "../src/reports.js";
import { DemoHealth } from "../src/api.js";
const date = "2026-10-17";
function fixture(count = 28) {
  const r = normalizeReport(date, shiftDate(date, 1), ["sleep", "heart"], {}, true);
  r.days = Array.from({ length: count + 1 }, (_, i) => ({
    date: shiftDate(date, i - count),
    metrics: {
      hrv: { value: 45, unit: "ms", quality: "available" as const },
      restingHeartRate: { value: 60, unit: "bpm", quality: "available" as const },
      sleepMinutes: { value: 420, unit: "minutes", quality: "available" as const },
    },
  }));
  return r;
}
function score(change: Partial<Record<"hrv" | "restingHeartRate" | "sleepMinutes", number>>) {
  const r = fixture();
  for (const [key, value] of Object.entries(change)) r.days.at(-1)!.metrics[key as "hrv"]!.value = value;
  return calculateRecovery(date, [r]);
}
describe("custom recovery", () => {
  it("is reproducible, transparent and labels an unchanged baseline as relative, not healthy", () => {
    const r = fixture(), a = calculateRecovery(date, [r]);
    expect(a).toEqual(calculateRecovery(date, [r]));
    expect(a.score).toBe(75); expect(a.baseline.pairedDays).toBe(28);
    expect(a.model.version).toBe("personal-relative-v1");
    expect(a.factors.hrv.robustScale).toBe(0.1);
    expect(a.limitations.join(" ")).toContain("chronically poor");
  });
  it("moves in the specified directions without rewarding longer sleep", () => {
    expect(score({ hrv: 30 }).score!).toBeLessThan(75);
    expect(score({ restingHeartRate: 70 }).score!).toBeLessThan(75);
    expect(score({ sleepMinutes: 300 }).score!).toBeLessThan(75);
    expect(score({ sleepMinutes: 600 }).score).toBe(75);
    expect(score({ hrv: 60, restingHeartRate: 55 }).score!).toBeGreaterThan(75);
  });
  it("requires paired target observations and never treats missing/zero as healthy", () => {
    for (const key of ["hrv", "restingHeartRate", "sleepMinutes"] as const) {
      const r = fixture(); r.days.at(-1)!.metrics[key] = { value: null, unit: "x", quality: "missing" };
      expect(calculateRecovery(date, [r])).toMatchObject({ score: null, reasons: ["TARGET_INPUTS_MISSING_OR_INVALID"] });
      expect(score({ [key]: 0 }).score).toBeNull();
    }
  });
  it("requires 14 paired days and recent data; gaps are not imputed", () => {
    expect(calculateRecovery(date, [fixture(13)]).score).toBeNull();
    expect(calculateRecovery(date, [fixture(14)]).score).toBe(75);
    const r = fixture();
    for (const day of r.days) if (day.date < date && day.date >= shiftDate(date, -7)) day.metrics.hrv!.quality = "partial";
    expect(calculateRecovery(date, [r])).toMatchObject({ score: null, baseline: { pairedDays: 21 }, reasons: ["BASELINE_NOT_RECENT"] });
  });
  it("excludes future/out-of-window data and conflicting dates, deduplicates identical days", () => {
    const r = fixture(), extra = structuredClone(r);
    extra.days = [structuredClone(r.days[0]), { ...structuredClone(r.days[0]), date: shiftDate(date, -29) }, { ...structuredClone(r.days[0]), date: shiftDate(date, 1) }];
    expect(calculateRecovery(date, [r, extra]).baseline.pairedDays).toBe(28);
    extra.days[0].metrics.hrv!.value = 10;
    expect(calculateRecovery(date, [r, extra]).baseline.pairedDays).toBe(27);
    extra.days = [structuredClone(r.days.at(-1)!)]; extra.days[0].metrics.hrv!.value = 10;
    expect(calculateRecovery(date, [r, extra]).score).toBeNull();
  });
  it("is robust to one historical outlier, handles constant baselines, and bounds finite output", () => {
    const r = fixture(); r.days[0].metrics.hrv!.value = 400;
    expect(calculateRecovery(date, [r]).score).toBe(75);
    for (const changed of [{ hrv: 1, restingHeartRate: 300, sleepMinutes: 1 }, { hrv: 500, restingHeartRate: 1, sleepMinutes: 1440 }]) {
      const result = score(changed); expect(Number.isFinite(result.score)).toBe(true); expect(result.score!).toBeGreaterThanOrEqual(0); expect(result.score!).toBeLessThanOrEqual(100);
    }
  });
  it("fetches bounded windows and propagates provider failures instead of making a fallback score", async () => {
    const api = new DemoHealth(), read = vi.spyOn(api, "points");
    expect((await recovery(api, date)).status).toBe("calculated");
    expect(read.mock.calls.every(([, a, b]) => Date.parse(b) - Date.parse(a) <= 14 * 86400000)).toBe(true);
    read.mockRejectedValue(new Error("provider failed"));
    const failed = await recovery(api, date);
    expect(failed.score).toBeNull(); expect(failed.source.some(s => s.issues.length)).toBe(true);
  });
});

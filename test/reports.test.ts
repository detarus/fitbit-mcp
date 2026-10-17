import { describe, it, expect, vi } from "vitest";
import { DemoHealth } from "../src/api.js";
import { normalizeReport, compareReports, report, comparisonRange, calendarDates } from "../src/reports.js";

const day = (n: number) => ({ date: { year: 2026, month: 10, day: n } });
const steps = (n: number, value: unknown) => ({ civilStartTime: day(n), steps: { countSum: value } });
const sleep = (start: string, end: string, wake: number, minutes: unknown) => ({ sleep: { interval: { startTime: start, endTime: end, civilEndTime: day(wake) }, summary: { minutesAsleep: minutes }, metadata: { processed: true } } });
describe("normalized reports", () => {
  it("retains explicit zero, distinguishes missing and refuses whole-period totals with gaps", () => {
    const r = normalizeReport("2026-10-01", "2026-10-03", ["activity"], { steps: { rollupDataPoints: [steps(1, "0")] } });
    expect(r.days[0].metrics.steps).toMatchObject({ value: 0, quality: "available" });
    expect(r.days[1].metrics.steps).toMatchObject({ value: null, quality: "missing" });
    expect(r.summary.steps).toMatchObject({ observedDays: 1, expectedDays: 2, observedSum: 0, total: null, observedMean: 0, complete: false });
  });
  it("converts documented millimetres to kilometres and keeps burned calories separate", () => {
    const r = normalizeReport("2026-10-01", "2026-10-02", ["activity"], { distance: { rollupDataPoints: [{ civilStartTime: day(1), distance: { millimetersSum: "1250000" } }] }, "total-calories": { rollupDataPoints: [{ civilStartTime: day(1), totalCalories: { kcalSum: 2100 } }] } });
    expect(r.days[0].metrics.distanceKm?.value).toBe(1.25);
    expect(r.days[0].metrics.caloriesBurned?.value).toBe(2100);
  });
  it("does not multiply active-zone minutes or infer missing zones as zero", () => {
    const r = normalizeReport("2026-10-01", "2026-10-02", ["activity"], { "active-zone-minutes": { rollupDataPoints: [{ civilStartTime: day(1), activeZoneMinutes: { sumInCardioHeartZone: "20", sumInPeakHeartZone: "0" } }] } });
    expect(r.days[0].metrics.cardioZoneMinutes?.value).toBe(20);
    expect(r.days[0].metrics.peakZoneMinutes?.value).toBe(0);
    expect(r.days[0].metrics.fatBurnZoneMinutes?.value).toBeNull();
  });
  it("deduplicates identical rollups but rejects conflicting records", () => {
    const a = normalizeReport("2026-10-01", "2026-10-02", ["activity"], { steps: { rollupDataPoints: [steps(1, "100"), steps(1, "100")] } });
    expect(a.summary.steps.total).toBe(100);
    const b = normalizeReport("2026-10-01", "2026-10-02", ["activity"], { steps: { rollupDataPoints: [steps(1, "100"), steps(1, "200")] } });
    expect(b.days[0].metrics.steps?.quality).toBe("conflict"); expect(b.summary.steps.total).toBeNull();
  });
  it("preserves permission errors and incomplete results without zero filling", () => {
    const r = normalizeReport("2026-10-01", "2026-10-02", ["heart", "sleep"], { "daily-resting-heart-rate": { error: { code: "MISSING_SCOPE", message: "Not granted" } }, sleep: { dataPoints: [sleep("2026-09-30T22:00:00Z", "2026-10-01T06:00:00Z", 1, "420")], complete: false } });
    expect(r.days[0].metrics.restingHeartRate?.quality).toBe("error");
    expect(r.days[0].metrics.sleepMinutes?.quality).toBe("partial");
    expect(r.issues.map(i => i.code)).toEqual(["MISSING_SCOPE", "PARTIAL"]);
  });
  it("normalizes daily pulse/HRV without turning an absent HRV into another statistic", () => {
    const r = normalizeReport("2026-10-01", "2026-10-02", ["heart"], { "daily-resting-heart-rate": { dataPoints: [{ dailyRestingHeartRate: { date: day(1).date, beatsPerMinute: "58" } }] }, "daily-heart-rate-variability": { dataPoints: [{ dailyHeartRateVariability: { date: day(1).date, entropy: 3 } }] } });
    expect(r.days[0].metrics.restingHeartRate).toMatchObject({ value: 58, unit: "bpm" });
    expect(r.days[0].metrics.hrv).toMatchObject({ value: null, quality: "invalid" });
  });
  it("rejects out-of-range, unsafe and malformed numeric values", () => {
    for (const bad of [null, "", "  ", "not-a-number", "Infinity", -1, Number.MAX_SAFE_INTEGER + 1]) {
      const r = normalizeReport("2026-10-01", "2026-10-02", ["activity"], { steps: { rollupDataPoints: [steps(1, bad)] } });
      expect(r.summary.steps.observedMean).toBeNull();
    }
  });
  it("handles wake dates, naps and identical session duplicates without adding interval length as sleep", () => {
    const main = sleep("2026-09-30T22:00:00Z", "2026-10-01T06:00:00Z", 1, "420");
    const nap = sleep("2026-10-01T12:00:00Z", "2026-10-01T13:00:00Z", 1, "45");
    const r = normalizeReport("2026-10-01", "2026-10-02", ["sleep"], { sleep: { dataPoints: [main, main, nap], complete: true } });
    expect(r.summary.sleepMinutes.total).toBe(465);
  });
  it("does not sum overlapping sleep sources", () => {
    const r = normalizeReport("2026-10-01", "2026-10-02", ["sleep"], { sleep: { dataPoints: [sleep("2026-09-30T22:00:00Z", "2026-10-01T06:00:00Z", 1, "420"), sleep("2026-09-30T23:00:00Z", "2026-10-01T07:00:00Z", 1, "440")] } });
    expect(r.days[0].metrics.sleepMinutes?.quality).toBe("conflict"); expect(r.summary.sleepMinutes.total).toBeNull();
  });
  it("uses physical time for sleep duration across DST and provider civil dates for grouping", () => {
    const session = sleep("2026-10-24T22:00:00+02:00", "2026-10-25T06:00:00+01:00", 25, "500");
    const r = normalizeReport("2026-10-25", "2026-10-26", ["sleep"], { sleep: { dataPoints: [session] } });
    expect(r.days[0].metrics.sleepMinutes?.value).toBe(500);
    expect(calendarDates("2026-10-24", "2026-10-27")).toHaveLength(3);
  });
  it("uses the end offset when civil wake date is absent and never assumes UTC", () => {
    const p = sleep("2026-09-30T19:00:00Z", "2026-10-01T02:00:00Z", 1, "400");
    delete (p.sleep.interval as any).civilEndTime; (p.sleep.interval as any).endUtcOffset = "-14400s";
    const r = normalizeReport("2026-09-30", "2026-10-01", ["sleep"], { sleep: { dataPoints: [p] } });
    expect(r.days[0].metrics.sleepMinutes?.value).toBe(400);
    delete (p.sleep.interval as any).endUtcOffset;
    const invalid = normalizeReport("2026-09-30", "2026-10-01", ["sleep"], { sleep: { dataPoints: [p] } });
    expect(invalid.days[0].metrics.sleepMinutes?.quality).toBe("missing"); expect(invalid.issues[0].code).toBe("INVALID_DATE");
  });
  it("compares paired day positions and leaves percentage from zero undefined", () => {
    const current = normalizeReport("2026-10-03", "2026-10-05", ["activity"], { steps: { rollupDataPoints: [steps(3, "100"), steps(4, "1000")] } });
    const previous = normalizeReport("2026-10-01", "2026-10-03", ["activity"], { steps: { rollupDataPoints: [steps(1, "0")] } });
    const comparison: any = compareReports(current, previous).comparisons.steps;
    expect(comparison).toMatchObject({ pairedDays: 1, currentPairedMean: 100, previousPairedMean: 0, meanDelta: 100, percentChange: null, complete: false });
  });
  it("validates equal length comparisons before making requests", () => {
    expect(comparisonRange("2026-10-08", "2026-10-15")).toEqual({ startDate: "2026-10-01", endDate: "2026-10-08" });
    expect(() => comparisonRange("2026-10-08", "2026-10-15", "2026-10-01")).toThrow();
    expect(() => comparisonRange("2026-10-08", "2026-10-15", "2026-10-01", "2026-10-03")).toThrow();
  });
  it("fetches reconciled data, continues pages and keeps one failed domain separate", async () => {
    const api = new DemoHealth();
    const points = vi.spyOn(api, "points").mockResolvedValueOnce({ dataPoints: [], complete: false, nextPageToken: "next" }).mockResolvedValueOnce({ dataPoints: [], complete: true });
    const r = await report(api, "2026-10-01", "2026-10-02", ["sleep"]);
    expect(points.mock.calls[0][4]).toBe(true); expect(points.mock.calls[1][3]).toBe("next");
    expect(r.summary.sleepMinutes.observedDays).toBe(0);
    vi.spyOn(api, "daily").mockRejectedValue(new AppError("MISSING_SCOPE", "No activity grant"));
    const mixed = await report(api, "2026-10-01", "2026-10-02", ["activity", "heart"]);
    expect(mixed.days[0].metrics.steps?.quality).toBe("error");
    expect(mixed.days[0].metrics.restingHeartRate?.value).toBe(60);
  });
});
import { AppError } from "../src/errors.js";

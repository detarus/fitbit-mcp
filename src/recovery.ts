import { dateSchema } from "./schema.js";
import { report, shiftDate, type Report } from "./reports.js";
import type { HealthApi } from "./api.js";

export const recoveryModel = {
  version: "personal-relative-v1",
  baselineDays: 28, minimumPairedDays: 14, minimumRecentDays: 3,
  centerScore: 75, pointsPerDeviation: 25,
  weights: { hrv: 0.4, restingHeartRate: 0.3, sleepMinutes: 0.3 },
  scaleFloors: { hrv: 0.1, restingHeartRate: 3, sleepMinutes: 45 },
  deviationBounds: [-3, 2],
} as const;
type Key = keyof typeof recoveryModel.weights;
const keys = Object.keys(recoveryModel.weights) as Key[];
const median = (a: number[]) => { const v = [...a].sort((a, b) => a - b); return (v[Math.floor((v.length - 1) / 2)] + v[Math.floor(v.length / 2)]) / 2; };
const round = (v: number) => Math.round(v * 1e6) / 1e6;
function valid(day: Report["days"][number]) {
  return keys.every(key => {
    const m = day.metrics[key], v = m?.value;
    return m?.quality === "available" && typeof v === "number" && Number.isFinite(v) && v > 0
      && v <= (key === "sleepMinutes" ? 1440 : key === "hrv" ? 500 : 300);
  });
}
/** Pure and deterministic. Historical windows are filtered again here to prevent target/future leakage. */
export function calculateRecovery(date: string, reports: Report[]) {
  dateSchema.parse(date);
  const start = shiftDate(date, -recoveryModel.baselineDays);
  const map = new Map<string, Report["days"][number]>(), conflicts = new Set<string>();
  for (const day of reports.flatMap(r => r.days)) {
    if (!dateSchema.safeParse(day.date).success || day.date < start || day.date > date) continue;
    const previous = map.get(day.date);
    const signature = (d: typeof day) => JSON.stringify(keys.map(k => d.metrics[k]));
    if (previous && signature(previous) !== signature(day)) conflicts.add(day.date);
    else map.set(day.date, day);
  }
  const baseline = [...map.values()].filter(d => d.date < date && !conflicts.has(d.date) && valid(d)).sort((a, b) => a.date.localeCompare(b.date));
  const recentDays = baseline.filter(d => d.date >= shiftDate(date, -7)).length;
  const target = map.get(date), reasons: string[] = [];
  if (!target || conflicts.has(date) || !valid(target)) reasons.push("TARGET_INPUTS_MISSING_OR_INVALID");
  if (baseline.length < recoveryModel.minimumPairedDays) reasons.push("INSUFFICIENT_BASELINE");
  if (recentDays < recoveryModel.minimumRecentDays) reasons.push("BASELINE_NOT_RECENT");
  const factors = Object.fromEntries(keys.map(key => {
    const transform = (n: number) => key === "hrv" ? Math.log(n) : n;
    const values = baseline.map(d => transform(d.metrics[key]!.value!));
    const center = values.length ? median(values) : null;
    const mad = center === null ? null : median(values.map(v => Math.abs(v - center)));
    const scale = mad === null ? null : Math.max(1.4826 * mad, recoveryModel.scaleFloors[key]);
    const raw = target?.metrics[key], observed = raw?.quality === "available" ? raw.value : null;
    const usable = target !== undefined && !conflicts.has(date) && valid(target);
    let deviation: number | null = usable && center !== null && scale !== null ? (transform(observed!) - center) / scale : null;
    if (deviation !== null) {
      if (key === "restingHeartRate") deviation *= -1;
      // Longer sleep does not generate a bonus. This is a relative trend, not a sleep target.
      deviation = Math.min(key === "sleepMinutes" ? 0 : 2, Math.max(-3, deviation));
    }
    return [key, {
      observed, unit: key === "hrv" ? "ms" : key === "sleepMinutes" ? "minutes" : "bpm",
      quality: conflicts.has(date) ? "conflict" : raw?.quality || "missing",
      baselineMedian: center === null ? null : round(key === "hrv" ? Math.exp(center) : center),
      transform: key === "hrv" ? "natural-log" : "identity",
      transformedMedian: center === null ? null : round(center),
      robustScale: scale === null ? null : round(scale),
      weight: recoveryModel.weights[key], boundedDeviation: deviation === null ? null : round(deviation),
      scoreContribution: reasons.length || deviation === null ? null : round(25 * recoveryModel.weights[key] * deviation),
    }];
  }));
  const sum = Object.values(factors).reduce((s, f) => s + (f.scoreContribution || 0), 75);
  return {
    demo: reports.some(r => r.demo), date, model: recoveryModel, status: reasons.length ? "insufficient_data" : "calculated",
    score: reasons.length ? null : Math.round(Math.max(0, Math.min(100, sum))), scale: "0–100, relative to personal history",
    reasons, baseline: { startDate: start, endDate: date, pairedDays: baseline.length, expectedDays: 28, recentDays, dates: baseline.map(d => d.date), excludedConflictingDates: [...conflicts].sort() },
    factors, source: reports.map(r => ({ startDate: r.startDate, endDate: r.endDate, fetchedAt: r.fetchedAt, source: r.source, issues: r.issues })),
    limitations: [
      "Custom unvalidated wellness heuristic, not Fitbit Daily Readiness, a diagnosis, a probability, or exercise clearance.",
      "A score near 75 means usual for this history; a chronically poor baseline can still yield 75.",
      "Daily sleep uses recorded minutes asleep by wake date, including naps; HRV/RHR reflect provider-derived wearable estimates.",
      "Wearable sources are reconciled as google-wearables, not isolated to one bracelet. Late sync, device changes and illness can change interpretation.",
      "Weights, scale floors and thresholds are engineering choices. Missing inputs are never imputed; other vital metrics do not affect this model.",
    ],
  };
}
export async function recovery(api: HealthApi, date: string) {
  dateSchema.parse(date);
  const domains = ["sleep", "heart"] as const;
  const first = await report(api, shiftDate(date, -28), shiftDate(date, -14), [...domains]);
  const second = await report(api, shiftDate(date, -14), date, [...domains]);
  const target = await report(api, date, shiftDate(date, 1), [...domains]);
  return calculateRecovery(date, [first, second, target]);
}

import { z } from "zod";
import { type HealthApi, type Json } from "./api.js";
import { AppError, publicError } from "./errors.js";
import { dateSchema, rangeSchema, type DataType } from "./schema.js";

export const domainsSchema = z.array(z.enum(["activity", "sleep", "heart", "vitals"])).min(1).max(4).default(["activity", "sleep", "heart", "vitals"]);
type Domain = z.infer<typeof domainsSchema>[number];
type Quality = "available" | "missing" | "invalid" | "conflict" | "partial" | "error";
type Metric = { value: number | null; unit: string; quality: Quality; reason?: string };
const definitions = {
  steps: { unit: "steps", domain: "activity", sum: true },
  distanceKm: { unit: "km", domain: "activity", sum: true },
  caloriesBurned: { unit: "kcal", domain: "activity", sum: true },
  cardioZoneMinutes: { unit: "minutes", domain: "activity", sum: true },
  peakZoneMinutes: { unit: "minutes", domain: "activity", sum: true },
  fatBurnZoneMinutes: { unit: "minutes", domain: "activity", sum: true },
  sleepMinutes: { unit: "minutes", domain: "sleep", sum: true },
  restingHeartRate: { unit: "bpm", domain: "heart", sum: false },
  hrv: { unit: "ms", domain: "heart", sum: false },
  oxygenSaturation: { unit: "%", domain: "vitals", sum: false },
  respiratoryRate: { unit: "breaths/min", domain: "vitals", sum: false },
  skinTemperatureDelta: { unit: "°C relative to provider baseline", domain: "vitals", sum: false },
} as const;
type Key = keyof typeof definitions;
type Day = { date: string; metrics: Partial<Record<Key, Metric>> };
type Dataset = { dataPoints?: Json[]; rollupDataPoints?: Json[]; complete?: boolean; error?: ReturnType<typeof publicError> };
export type Report = {
  demo: boolean; startDate: string; endDate: string; fetchedAt: string;
  source: string; timeBasis: string; domains: Domain[];
  days: Day[]; summary: Record<string, { unit: string; observedDays: number; expectedDays: number; complete: boolean; observedMean: number | null; observedSum?: number | null; total?: number | null }>;
  issues: { domain: string; code: string; message: string }[];
};

export function shiftDate(date: string, days: number) {
  dateSchema.parse(date);
  return new Date(Date.parse(date) + days * 86400000).toISOString().slice(0, 10);
}
export function calendarDates(start: string, end: string) {
  rangeSchema.parse({ startDate: start, endDate: end });
  const result: string[] = [];
  for (let date = start; date < end; date = shiftDate(date, 1)) result.push(date);
  return result;
}
export function dateValue(value: unknown): string | undefined {
  if (typeof value !== "object" || !value) return undefined;
  const v = value as Json;
  if (![v.year, v.month, v.day].every(Number.isInteger)) return undefined;
  const date = String(v.year).padStart(4, "0") + "-" + String(v.month).padStart(2, "0") + "-" + String(v.day).padStart(2, "0");
  return dateSchema.safeParse(date).success ? date : undefined;
}
function number(value: unknown): number | undefined {
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  if (typeof value === "string" && !/^-?\d+(\.\d+)?$/.test(value)) return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= Number.MAX_SAFE_INTEGER ? n : undefined;
}
function rounded(value: number) { return Math.round(value * 1e6) / 1e6; }
function metric(key: Key, value: unknown): Metric {
  const signed = key === "skinTemperatureDelta" && typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER;
  const n = signed ? value as number : number(value);
  const invalid = n === undefined || (key === "oxygenSaturation" && n > 100);
  return invalid ? { value: null, unit: definitions[key].unit, quality: "invalid", reason: "Missing or invalid provider field; no zero was inferred." } : { value: n!, unit: definitions[key].unit, quality: "available" };
}
function wakeDate(interval: Json) {
  const civil = dateValue(interval.civilEndTime?.date);
  if (civil) return civil;
  const offset = typeof interval.endUtcOffset === "string" && /^-?\d+(\.\d+)?s$/.test(interval.endUtcOffset) ? Number(interval.endUtcOffset.slice(0, -1)) : undefined;
  const physical = typeof interval.endTime === "string" ? Date.parse(interval.endTime) : NaN;
  if (offset === undefined || Math.abs(offset) > 86400 || !Number.isFinite(physical)) return undefined;
  return new Date(physical + offset * 1000).toISOString().slice(0, 10);
}
async function data(api: HealthApi, type: DataType, start: string, end: string): Promise<Dataset> {
  const dataPoints: Json[] = [], seen = new Set<string>();
  let token: string | undefined;
  for (let page = 0; page < 4; page++) {
    const batch = await api.points(type, start, end, token, true);
    if (!Array.isArray(batch.dataPoints)) throw new AppError("API_RESPONSE", "Unexpected reconciled data format.");
    dataPoints.push(...batch.dataPoints);
    if (batch.complete === true) return { dataPoints, complete: true };
    token = batch.nextPageToken;
    if (!token || seen.has(token)) return { dataPoints, complete: false };
    seen.add(token);
  }
  return { dataPoints, complete: false };
}
export function normalizeReport(
  start: string, end: string, domains: Domain[], inputs: Record<string, Dataset>, demo = false,
): Report {
  const dates = calendarDates(start, end);
  const keys = (Object.keys(definitions) as Key[]).filter(key => domains.includes(definitions[key].domain));
  const days: Day[] = dates.map(date => ({ date, metrics: Object.fromEntries(keys.map(key => [key, { value: null, unit: definitions[key].unit, quality: "missing" }])) }));
  const byDate = new Map(days.map(day => [day.date, day]));
  const issues: Report["issues"] = [];
  function write(date: string | undefined, key: Key, value: unknown) {
    if (!date) { issues.push({ domain: definitions[key].domain, code: "INVALID_DATE", message: "A provider record could not be assigned to a valid civil date." }); return; }
    const day = byDate.get(date); if (!day) return;
    const next = metric(key, value), previous = day.metrics[key];
    if (previous && previous.quality !== "missing") {
      if (previous.quality === "available" && next.quality === "available" && previous.value === next.value) return;
      day.metrics[key] = { value: null, unit: next.unit, quality: "conflict", reason: "Multiple incompatible records for this civil day; no average or sum was invented." };
    } else day.metrics[key] = next;
  }
  function available(domain: string, input: Dataset | undefined, affected: Key[]) {
    if (input?.error || input?.complete === false) {
      const quality = input.error ? "error" : "partial";
      for (const day of days) for (const key of affected) day.metrics[key] = { value: null, unit: definitions[key].unit, quality, reason: input.error?.code || "Incomplete provider result" };
      issues.push({ domain, code: input.error?.code || "PARTIAL", message: input.error?.message || "Provider result was incomplete; no whole-period totals were inferred." });
      return false;
    }
    return true;
  }
  if (domains.includes("activity")) {
    const activity = [
      ["steps", "steps", [["steps", "countSum", 1]]],
      ["distance", "distance", [["distanceKm", "millimetersSum", 0.000001]]],
      ["total-calories", "totalCalories", [["caloriesBurned", "kcalSum", 1]]],
      ["active-zone-minutes", "activeZoneMinutes", [["cardioZoneMinutes", "sumInCardioHeartZone", 1], ["peakZoneMinutes", "sumInPeakHeartZone", 1], ["fatBurnZoneMinutes", "sumInFatBurnHeartZone", 1]]],
    ] as const;
    for (const [type, member, fields] of activity) {
      const input = inputs[type];
      if (!available(type, input, fields.map(([key]) => key))) continue;
      for (const point of input?.rollupDataPoints || []) {
        const date = dateValue(point.civilStartTime?.date);
        if (!point[member]) continue; // Entirely missing rollup payload is not a measured zero.
        for (const [key, field, factor] of fields) {
          const value = number(point[member][field]);
          write(date, key, value === undefined ? undefined : rounded(value * factor));
        }
      }
    }
  }
  if (domains.includes("heart")) {
    for (const [type, member, field, key] of [
      ["daily-resting-heart-rate", "dailyRestingHeartRate", "beatsPerMinute", "restingHeartRate"],
      ["daily-heart-rate-variability", "dailyHeartRateVariability", "averageHeartRateVariabilityMilliseconds", "hrv"],
    ] as const) {
      const input = inputs[type];
      if (!available(type, input, [key])) continue;
      for (const point of input?.dataPoints || []) if (point[member]) write(dateValue(point[member].date), key, point[member][field]);
    }
  }
  if (domains.includes("vitals")) {
    for (const [type, member, key] of [
      ["daily-oxygen-saturation", "dailyOxygenSaturation", "oxygenSaturation"],
      ["daily-respiratory-rate", "dailyRespiratoryRate", "respiratoryRate"],
      ["daily-sleep-temperature-derivations", "dailySleepTemperatureDerivations", "skinTemperatureDelta"],
    ] as const) {
      const input = inputs[type];
      if (!available(type, input, [key])) continue;
      for (const point of input?.dataPoints || []) {
        const value = point[member]; if (!value) continue;
        const a = number(value.nightlyTemperatureCelsius), b = number(value.baselineTemperatureCelsius);
        const observation = key === "oxygenSaturation" ? value.averagePercentage : key === "respiratoryRate" ? value.breathsPerMinute
          : a === undefined || b === undefined ? undefined : rounded(a - b);
        write(dateValue(value.date), key, observation);
      }
    }
  }
  if (domains.includes("sleep") && available("sleep", inputs.sleep, ["sleepMinutes"])) {
    const sessions = new Map<string, { start: number; end: number; minutes: number | undefined; pending: boolean }[]>();
    for (const point of inputs.sleep?.dataPoints || []) {
      const sleep = point.sleep;
      if (!sleep?.interval) continue;
      const date = wakeDate(sleep.interval);
      if (!date) { issues.push({ domain: "sleep", code: "INVALID_DATE", message: "Sleep has no usable wake date/offset; UTC date was not substituted." }); continue; }
      if (!byDate.has(date)) continue;
      const entry = { start: Date.parse(sleep.interval.startTime), end: Date.parse(sleep.interval.endTime), minutes: number(sleep.summary?.minutesAsleep), pending: sleep.metadata?.processed === false };
      const group = sessions.get(date) || [];
      if (!group.some(s => s.start === entry.start && s.end === entry.end && s.minutes === entry.minutes && s.pending === entry.pending)) group.push(entry);
      sessions.set(date, group);
    }
    // A session overlap invalidates every affected wake day, including cross-day overlaps.
    const all = [...sessions.entries()].flatMap(([date, values]) => values.map(value => ({ date, ...value })));
    const overlapping = new Set<string>();
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++)
      if (all[i].start < all[j].end && all[j].start < all[i].end) { overlapping.add(all[i].date); overlapping.add(all[j].date); }
    for (const [date, values] of sessions) {
      const invalid = values.some(s => !Number.isFinite(s.start) || !Number.isFinite(s.end) || s.end <= s.start || s.minutes === undefined || s.minutes > (s.end - s.start) / 60000 + 1);
      const pending = values.some(s => s.pending);
      const quality: Quality = invalid ? "invalid" : overlapping.has(date) ? "conflict" : pending ? "partial" : "available";
      byDate.get(date)!.metrics.sleepMinutes = { value: quality === "available" ? rounded(values.reduce((sum, s) => sum + s.minutes!, 0)) : null, unit: "minutes", quality, ...(quality === "available" ? {} : { reason: "Sleep sessions have invalid, overlapping or still-processing observations." }) };
    }
  }
  const summary: Report["summary"] = {};
  for (const key of keys) {
    const values = days.map(day => day.metrics[key]!).filter(v => v.quality === "available").map(v => v.value!);
    const sum = values.length ? rounded(values.reduce((a, b) => a + b, 0)) : null;
    const complete = values.length === days.length;
    summary[key] = { unit: definitions[key].unit, observedDays: values.length, expectedDays: days.length, complete, observedMean: sum === null ? null : rounded(sum / values.length), ...(definitions[key].sum ? { observedSum: sum, total: complete ? sum : null } : {}) };
  }
  return { demo, startDate: start, endDate: end, fetchedAt: new Date().toISOString(), source: demo ? "synthetic" : "Google Health v4: reconciled google-wearables (Fitbit and Pixel Watch; not device-specific)", timeBasis: "Provider civil dates; sleep belongs to wake date; physical intervals are used only for overlap/duration checks.", domains, days, summary, issues };
}
export async function report(api: HealthApi, start: string, end: string, domains: Domain[] = ["activity", "sleep", "heart", "vitals"]) {
  rangeSchema.parse({ startDate: start, endDate: end });
  const selected = [...new Set(domainsSchema.parse(domains))], inputs: Record<string, Dataset> = {};
  const requests: { type: DataType; daily: boolean }[] = [];
  if (selected.includes("activity")) for (const type of ["steps", "distance", "total-calories", "active-zone-minutes"] as const) requests.push({ type, daily: true });
  if (selected.includes("sleep")) requests.push({ type: "sleep", daily: false });
  if (selected.includes("heart")) for (const type of ["daily-resting-heart-rate", "daily-heart-rate-variability"] as const) requests.push({ type, daily: false });
  if (selected.includes("vitals")) for (const type of ["daily-oxygen-saturation", "daily-respiratory-rate", "daily-sleep-temperature-derivations"] as const) requests.push({ type, daily: false });
  for (let i = 0; i < requests.length; i += 2) await Promise.all(requests.slice(i, i + 2).map(async ({ type, daily }) => {
    try {
      const input = daily ? await api.daily(type, start, end) : await data(api, type, start, end);
      if (daily && input.rollupDataPoints !== undefined && !Array.isArray(input.rollupDataPoints)) throw new AppError("API_RESPONSE", "Unexpected daily rollup format.");
      inputs[type] = input;
    } catch (error) { inputs[type] = { error: publicError(error) }; }
  }));
  return normalizeReport(start, end, selected, inputs, api.demo);
}
export function compareReports(current: Report, previous: Report) {
  if (current.days.length !== previous.days.length) throw new AppError("COMPARE_RANGE", "Compare equal numbers of calendar days.");
  const comparisons: Record<string, unknown> = {};
  for (const key of Object.keys(current.summary) as Key[]) {
    const pairs = current.days.map((day, i) => [day.metrics[key], previous.days[i].metrics[key]]).filter(([a, b]) => a?.quality === "available" && b?.quality === "available");
    const currentMean = pairs.length ? pairs.reduce((sum, [a]) => sum + a!.value!, 0) / pairs.length : null;
    const previousMean = pairs.length ? pairs.reduce((sum, [, b]) => sum + b!.value!, 0) / pairs.length : null;
    comparisons[key] = { unit: definitions[key].unit, pairedDays: pairs.length, expectedDays: current.days.length, complete: pairs.length === current.days.length, currentPairedMean: currentMean === null ? null : rounded(currentMean), previousPairedMean: previousMean === null ? null : rounded(previousMean), meanDelta: currentMean === null || previousMean === null ? null : rounded(currentMean - previousMean), percentChange: previousMean === null || previousMean === 0 || currentMean === null ? null : rounded((currentMean - previousMean) / previousMean * 100) };
  }
  return { demo: current.demo || previous.demo, fetchedAt: new Date().toISOString(), method: "Means over paired relative calendar-day positions only; missing days are excluded from both sides. Percent change from zero is undefined.", current, previous, comparisons };
}

export function comparisonRange(startDate: string, endDate: string, previousStartDate?: string, previousEndDate?: string) {
  const days = calendarDates(startDate, endDate).length;
  if (!!previousStartDate !== !!previousEndDate) throw new AppError("COMPARE_RANGE", "Supply both previousStartDate and previousEndDate, or neither.");
  const previous = { startDate: previousStartDate || shiftDate(startDate, -days), endDate: previousEndDate || startDate };
  if (calendarDates(previous.startDate, previous.endDate).length !== days) throw new AppError("COMPARE_RANGE", "Compare equal numbers of calendar days.");
  return previous;
}

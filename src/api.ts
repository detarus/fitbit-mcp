import { Auth } from "./auth.js";
import { AppError } from "./errors.js";
import { civil, filterFor, type DataType } from "./schema.js";

export type Json = Record<string, any>;
export const scopesFor: Record<DataType, string> = {
  "steps": "activity_and_fitness.readonly", "distance": "activity_and_fitness.readonly",
  "total-calories": "activity_and_fitness.readonly", "active-zone-minutes": "activity_and_fitness.readonly",
  "exercise": "activity_and_fitness.readonly", "sleep": "sleep.readonly",
  "heart-rate": "health_metrics_and_measurements.readonly",
  "daily-resting-heart-rate": "health_metrics_and_measurements.readonly",
  "daily-heart-rate-variability": "health_metrics_and_measurements.readonly",
  "nutrition-log": "nutrition.readonly", "hydration-log": "nutrition.readonly",
};
export interface HealthApi {
  demo: boolean;
  accountKey(): Promise<string>;
  info(): Promise<unknown>;
  points(type: DataType, start: string, end: string, pageToken?: string, reconcile?: boolean): Promise<Json>;
  daily(type: DataType, start: string, end: string): Promise<Json>;
  create(type: "nutrition-log" | "hydration-log", body: Json): Promise<Json>;
  get(name: string): Promise<Json>;
  remove(type: "nutrition-log" | "hydration-log", name: string): Promise<void>;
}
export function validateName(name: string, type?: string) {
  const match = name.match(/^users\/[A-Za-z0-9._~-]+\/dataTypes\/(nutrition-log|hydration-log)\/dataPoints\/[A-Za-z0-9._~-]+$/);
  if (!match || (type && match[1] !== type)) throw new AppError("RESOURCE_NAME", "Invalid created resource name.");
  return name;
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
export class GoogleHealth implements HealthApi {
  demo = false;
  constructor(public auth: Auth, private fetcher: typeof fetch = fetch) {}
  async request(path: string, method = "GET", body?: Json, readOnly = method === "GET"): Promise<Json> {
    if (!/^users\//.test(path) || path.includes("..") || path.includes("://")) throw new AppError("PATH", "Invalid API path.");
    let refreshed = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      let response: Response;
      try {
        response = await this.fetcher("https://health.googleapis.com/v4/" + path, {
          method, headers: { Authorization: "Bearer " + await this.auth.accessToken(), "Content-Type": "application/json", Accept: "application/json" },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(20000), redirect: "error",
        });
      } catch (error) {
        if (error instanceof AppError) throw error;
        if (readOnly && attempt < 2) { await sleep(250 * 2 ** attempt); continue; }
        throw new AppError(readOnly ? "NETWORK" : "WRITE_UNCERTAIN", readOnly ? "Google Health request timed out or could not connect." : "Write outcome is unknown. Inspect this operation before any new submission.");
      }
      if (response.status === 401 && readOnly && !refreshed) { await response.body?.cancel(); await this.auth.accessToken(true); refreshed = true; continue; }
      if (readOnly && (response.status === 429 || response.status >= 500) && attempt < 2) {
        const value = response.headers.get("Retry-After");
        const seconds = value ? Number(value) : NaN;
        const wait = value ? (Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - Date.now()) : 250 * 2 ** attempt;
        await response.body?.cancel();
        // Do not retry earlier than a long server-requested delay.
        if (wait > 10000) throw new AppError("RATE_LIMIT", "Google requests a longer wait. Try again later.", response.status);
        await sleep(Math.max(0, Number.isFinite(wait) ? wait : 1000)); continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        const code = response.status === 401 ? "AUTH_REQUIRED" : response.status === 403 ? "PERMISSION_DENIED" : response.status === 429 ? "RATE_LIMIT" : response.status === 400 ? "API_ARGUMENT" : "API_ERROR";
        throw new AppError(code, "Google Health HTTP " + response.status + ". Check granted scopes, API compatibility, and the requested period.", response.status);
      }
      try { return response.status === 204 ? {} : await response.json() as Json; }
      catch { throw new AppError(readOnly ? "API_RESPONSE" : "WRITE_UNCERTAIN", "Google returned an unreadable response; inspect operation state before retrying a write."); }
    }
    throw new AppError("API_RETRIES", "Google Health retry limit reached. Try again later.");
  }
  async accountKey() {
    const record = await this.auth.record(), config = await this.auth.config();
    if (!record?.accountId) throw new AppError("AUTH_REQUIRED", "Run auth to establish your Google Health identity.");
    return config.clientId + ":" + record.accountId;
  }
  async info() {
    await this.auth.requireScope("settings.readonly");
    return this.request("users/me/pairedDevices");
  }
  async points(type: DataType, start: string, end: string, pageToken = "", reconcile = false): Promise<Json> {
    await this.auth.requireScope(scopesFor[type]);
    let next = pageToken, points: Json[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const params = new URLSearchParams({ filter: filterFor(type, start, end), pageSize: "25" });
      if (next) params.set("pageToken", next);
      if (reconcile) params.set("dataSourceFamily", "users/me/dataSourceFamilies/google-wearables");
      const page = await this.request("users/me/dataTypes/" + type + "/dataPoints" + (reconcile ? ":reconcile" : "") + "?" + params);
      if (page.dataPoints && !Array.isArray(page.dataPoints)) throw new AppError("API_RESPONSE", "Unexpected data-point list.");
      points.push(...(page.dataPoints || []));
      next = page.nextPageToken || "";
      if (!next) return { dataPoints: points, complete: true, source: "google-health", mode: reconcile ? "reconciled" : "raw-list", note: reconcile ? "Server-reconciled Google/Fitbit wearable sources." : "Raw sources may overlap; do not sum overlapping samples." };
      if (seen.has(next)) throw new AppError("PAGINATION", "Google repeated a page token; results are incomplete.");
      seen.add(next);
    }
    return { dataPoints: points, complete: false, nextPageToken: next, source: "google-health", note: "Stopped after 20 pages. Continue with this nextPageToken as pageToken and the SAME type/date range. Do not describe this batch as the full period." };
  }
  async daily(type: DataType, start: string, end: string): Promise<Json> {
    await this.auth.requireScope(scopesFor[type]);
    return this.request("users/me/dataTypes/" + type + "/dataPoints:dailyRollUp", "POST", {
      range: { start: civil(start), end: civil(end) }, windowSizeDays: 1, dataSourceFamily: "users/me/dataSourceFamilies/google-wearables",
    }, true);
  }
  async create(type: "nutrition-log" | "hydration-log", body: Json) {
    await this.auth.requireScope("nutrition.writeonly");
    return this.request("users/me/dataTypes/" + type + "/dataPoints", "POST", body, false);
  }
  async get(name: string) { return this.request(validateName(name)); }
  async remove(type: "nutrition-log" | "hydration-log", name: string) {
    await this.auth.requireScope("nutrition.writeonly");
    await this.request("users/me/dataTypes/" + type + "/dataPoints:batchDelete", "POST", { names: [validateName(name, type)] }, false);
  }
}
export class DemoHealth implements HealthApi {
  demo = true;
  private records = new Map<string, Json>();
  async accountKey() { return "synthetic-demo"; }
  async info() { return { demo: true, pairedDevices: [{ displayName: "Synthetic Fitbit Air" }] }; }
  async points(type: DataType, start: string, end: string) {
    if (type === "nutrition-log" || type === "hydration-log") return { demo: true, complete: true, dataPoints: [...this.records.values()].filter(p => p.name.includes("/" + type + "/")) };
    if (type === "sleep") return {
      demo: true, complete: true,
      dataPoints: [{ dataPointName: "demo-sleep", sleep: { interval: { startTime: new Date(Date.parse(start) - 2 * 3600000).toISOString(), endTime: start + "T06:00:00Z", civilEndTime: civil(start) }, summary: { minutesAsleep: "420" }, metadata: { processed: true } } }],
    };
    if (type === "daily-resting-heart-rate" || type === "daily-heart-rate-variability") {
      const key = type === "daily-resting-heart-rate" ? "dailyRestingHeartRate" : "dailyHeartRateVariability";
      const value = type === "daily-resting-heart-rate" ? { beatsPerMinute: "60" } : { averageHeartRateVariabilityMilliseconds: 45 };
      return { demo: true, complete: true, dataPoints: [{ [key]: { date: civil(start).date, ...value } }] };
    }
    return { demo: true, complete: true, dataPoints: [], period: { start, end }, note: "No synthetic samples for this type; not a measured zero." };
  }
  async daily(type: DataType, start: string, end: string) {
    const key = ({ steps: "steps", distance: "distance", "total-calories": "totalCalories", "active-zone-minutes": "activeZoneMinutes" } as Record<string, string>)[type];
    const points: Json[] = [];
    for (let t = Date.parse(start); t < Date.parse(end); t += 86400000) points.push({ civilStartTime: civil(new Date(t).toISOString().slice(0, 10)), [key || type]: type === "steps" ? { countSum: String(6500 + points.length * 250) } : type === "distance" ? { millimetersSum: "5000000" } : type === "total-calories" ? { kcalSum: 2200 } : { sumInCardioHeartZone: "10", sumInPeakHeartZone: "5", sumInFatBurnHeartZone: "15" } });
    return { demo: true, rollupDataPoints: points };
  }
  async create(type: "nutrition-log" | "hydration-log", body: Json) {
    const name = "users/demo/dataTypes/" + type + "/dataPoints/" + crypto.randomUUID();
    const value = { ...body, name }; this.records.set(name, value);
    return { done: true, response: value };
  }
  async get(name: string) {
    const value = this.records.get(name);
    if (!value) throw new AppError("NOT_FOUND", "Demo record not found in this process.", 404);
    return value;
  }
  async remove(_type: string, name: string) { this.records.delete(name); }
}

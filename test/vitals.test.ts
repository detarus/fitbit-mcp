import { it, expect } from "vitest";
import { normalizeReport, report } from "../src/reports.js";
import { DemoHealth } from "../src/api.js";
const date = { year: 2026, month: 10, day: 1 };
function metrics(temp: Record<string, unknown>, oxygen: unknown = 97) {
  return normalizeReport("2026-10-01", "2026-10-03", ["vitals"], {
    "daily-sleep-temperature-derivations": { dataPoints: [{ dailySleepTemperatureDerivations: { date, ...temp } }] },
    "daily-oxygen-saturation": { dataPoints: [{ dailyOxygenSaturation: { date, averagePercentage: oxygen } }] },
    "daily-respiratory-rate": { dataPoints: [{ dailyRespiratoryRate: { date, breathsPerMinute: 15 } }] },
  });
}
it("derives signed skin delta from nightly minus baseline, not provider standard deviation", () => {
  const r = metrics({ nightlyTemperatureCelsius: 33.2, baselineTemperatureCelsius: 33.5, relativeNightlyStddev30dCelsius: 9 });
  expect(r.days[0].metrics.skinTemperatureDelta?.value).toBe(-0.3);
  expect(r.summary.skinTemperatureDelta.observedMean).toBe(-0.3);
  expect(r.summary.skinTemperatureDelta).not.toHaveProperty("total");
  expect(r.days[1].metrics.skinTemperatureDelta?.quality).toBe("missing");
});
it("does not invent a baseline, accepts true zero delta and rejects invalid saturation", () => {
  expect(metrics({ nightlyTemperatureCelsius: 33 }).days[0].metrics.skinTemperatureDelta?.value).toBeNull();
  expect(metrics({ nightlyTemperatureCelsius: 33, baselineTemperatureCelsius: 33 }, 101).days[0].metrics).toMatchObject({ skinTemperatureDelta: { value: 0 }, oxygenSaturation: { value: null, quality: "invalid" } });
});
it("fetches all three reconciled vitals through the report surface", async () => {
  const r = await report(new DemoHealth(), "2026-10-01", "2026-10-03", ["vitals"]);
  expect(r.summary.oxygenSaturation).toMatchObject({ complete: true, observedMean: 97 });
  expect(r.summary.respiratoryRate.observedMean).toBe(15);
});

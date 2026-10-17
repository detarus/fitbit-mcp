# Personal-relative recovery v1

This is fitbit-mcp's own unvalidated wellness heuristic, not Fitbit Daily Readiness or a clinical score. It does not prescribe exercise or diagnose conditions. A score of 75 means approximately usual for this history, not healthy, sufficiently rested, or safe to train.

## Inputs and coverage

Call `fitbit_recovery({date: "YYYY-MM-DD"})` or `fitbit-mcp recovery --date YYYY-MM-DD`. Use an explicit local date, normally a completed/synced wake day. End dates are exclusive. The service fetches 28 prior civil days in two 14-day windows and the target separately.

All three inputs must be available and positive on the target: daily HRV in ms, resting pulse in bpm, and recorded minutes asleep by wake date (including naps). At least 14 prior days must contain all three, including at least 3 of the last 7. Target and future days never enter the baseline. Gaps, partial/error/conflicting values, zero HRV and unusable inputs are excluded, never imputed. Conflicting duplicate dates are excluded. Otherwise the result is `score: null`, with reasons.

Broad input sanity ceilings (not diagnostic thresholds) are 1440 sleep minutes, 500 ms HRV and 300 bpm RHR. Providers may enforce tighter bounds. Google-wearables reconciliation can mix Fitbit/Pixel devices; the source is not isolated to one bracelet.

## Formula

Weights: HRV 0.4, RHR 0.3, sleep 0.3. Transform HRV with natural log; leave the others unchanged. For each input, compute the baseline median and median absolute deviation (MAD). Robust scale is `max(1.4826 * MAD, floor)`. Floors: 0.1 log-HRV, 3 bpm, 45 minutes.

Deviation is `(target - median) / scale`, reversing its sign for RHR. Clamp to [-3, 2]; sleep is additionally capped at 0, so extra sleep generates no bonus. Each factor contributes `25 * weight * deviation`. Add contributions to 75, clamp to [0, 100] and round to an integer. Intermediate values in the response are rounded to six decimal places.

Weights, thresholds, floors, center and caps are engineering choices. They have not been calibrated against outcomes or Fitbit's score. Chronic short sleep can become the baseline; more sleep does not prove better recovery; elevated HRV or low pulse can have other explanations. Device changes, late sync, travel and irregular sleep affect interpretation.

The report includes model version, dates and coverage, target values, baseline medians, transformed scales, bounded deviations, individual point contributions, provider issues and fetch times. Re-running after late sync can change the score. Do not label coverage as statistical confidence.

## Extra metrics

The `vitals` report domain adds daily average SpO2 (%), respiration (breaths/min) and skin temperature delta (°C). Delta is nightlyTemperatureCelsius minus baselineTemperatureCelsius. The optional relativeNightlyStddev30dCelsius is variability, not the nightly delta; it is not substituted. Missing baseline yields null, negative deltas are valid. This is wrist skin temperature, not core body temperature. These metrics are context only and do not contribute to v1.

API fields and device compatibility are documented by Google; their existence does not guarantee data for a particular account, region, night or firmware. Real Fitbit Air parity remains pending.

## Sources and validation

- [Fitbit Daily Readiness parameters](https://support.google.com/googlehealth/answer/14236710?hl=en): motivation for selecting HRV, resting pulse and sleep, not the formula.
- [Google Health Vitals](https://developers.google.com/health/data-types/vitals) and [REST data schemas](https://developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints).
- `test/recovery.test.ts`: gaps, recent coverage, zero/missing values, target exclusion, duplicate conflicts, directions, outliers, deterministic output and bounded windows.
- `test/vitals.test.ts`: units, signed deltas, missing baseline, saturation limits and reconciled fetching.

All fixtures and demos are synthetic. The model has no clinical validation.

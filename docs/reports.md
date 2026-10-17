# Daily summaries and comparisons

Tools: fitbit_summary and fitbit_compare. CLI: report and compare.

Inputs are explicit civil calendar dates, with an exclusive end date and a maximum of 14 days per window. Select activity, sleep and/or heart domains. Comparisons default to the immediately preceding window of equal length; a custom previous window must have the same number of calendar days.

## Metrics

| Metric | Unit | Source |
| --- | --- | --- |
| steps | steps | dailyRollUp.steps.countSum |
| distanceKm | km | dailyRollUp.distance.millimetersSum / 1,000,000 |
| caloriesBurned | kcal | dailyRollUp.totalCalories.kcalSum; calories expended, not food intake |
| cardioZoneMinutes / peakZoneMinutes / fatBurnZoneMinutes | minutes | corresponding dailyRollUp.activeZoneMinutes fields; no extra weighting |
| sleepMinutes | minutes | reconciled sleep.summary.minutesAsleep, assigned to wake date |
| restingHeartRate | bpm | reconciled dailyRestingHeartRate.beatsPerMinute |
| hrv | ms | reconciled dailyHeartRateVariability.averageHeartRateVariabilityMilliseconds |

Values are provider-calculated metrics, not AI estimates. Google-wearables is the API source family for Fitbit and Pixel Watch; it is not a per-device Fitbit-only filter.

Activity uses Google's civil-day daily rollups. Sleep and daily heart metrics use reconcile with wearable sources rather than summing raw streams. Full provider provenance remains available through fitbit_read; summaries expose source/method and quality without copying every raw record.

## Quality and completeness

Each requested metric on each day has a value (or null), a unit and a quality: available, missing, invalid, conflict, partial or error.

- An explicit 0 is an observed zero. Missing payloads and missing scalar fields are not automatically converted to zero.
- Incomplete pages suppress whole-domain values until complete; the report follows bounded continuation requests.
- Conflicting daily records produce null; identical daily values are not summed.
- Exact duplicate sleep sessions are deduplicated. Overlapping sessions invalidate affected wake days instead of double counting.
- Naps and main sleep can be summed only when the physical intervals do not overlap. Sleep duration comes from minutesAsleep, not time in bed.
- Sleep is grouped by provider civil wake date, or by the physical end time plus the explicit end offset. UTC is never silently substituted for the user's date.
- Physical intervals are used for overlap/duration checks across DST. Calendar-day counts are date arithmetic, not assumed 24-hour sleep durations.
- A failed or ungranted domain is explicit and does not prevent reporting the others.

observedMean and observedSum cover available days only. total is present only for additive metrics and stays null unless every requested day is available. Pulse and HRV are not totaled.

Comparison statistics pair the relative calendar-day positions in both windows. A missing day on either side removes that pair from both means. The response includes pairedDays, expectedDays and complete. Percent change from a previous mean of zero is null.

These checks do not establish a causal relationship between sleep and training and do not produce a medical assessment.

## Try without Google

```sh
node dist/cli.js report --demo --start 2026-10-01 --end 2026-10-08
node dist/cli.js compare --demo --start 2026-10-08 --end 2026-10-15 --domains activity
```

The synthetic backend intentionally has gaps in sleep/heart data so missing-day handling is visible.

## Primary references

Checked 2026-10-17:

- [Daily rollups](https://developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints/dailyRollUp)
- [Reconcile](https://developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints/reconcile)
- [Sleep, pulse and HRV schemas](https://developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints)
- [Distance](https://developers.google.com/health/reference/rest/v4/DistanceRollupValue)
- [Total calories](https://developers.google.com/health/reference/rest/v4/TotalCaloriesRollupValue)
- [Active-zone minutes](https://developers.google.com/health/reference/rest/v4/ActiveZoneMinutesRollupValue)

Live API representation and account/device coverage remain separate acceptance checks in ROADMAP.md.

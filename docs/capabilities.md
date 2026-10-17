# Read capabilities

Schema reference: src/schema.ts; transport: src/api.ts; summaries: src/reports.ts. API research and primary references: [research](research.md). Device-specific availability remains unverified until READ-05: missing data must not be interpreted as zero.

| Raw type | Surface and fields | Scope suffix |
| --- | --- | --- |
| steps, distance, total-calories, active-zone-minutes | Raw provider records; normalized daily activity totals with coverage | activity_and_fitness.readonly |
| exercise | Raw provider exercise records and pagination; no normalized workout summary or inferred workout classification | activity_and_fitness.readonly |
| sleep | Raw intervals/stages when supplied; normalized sleep minutes and overlap handling | sleep.readonly |
| heart-rate | Raw provider samples; daily summaries use resting pulse/HRV | health_metrics_and_measurements.readonly |
| daily-resting-heart-rate, daily-heart-rate-variability | Raw daily values; normalized RHR/HRV and optional recovery inputs | health_metrics_and_measurements.readonly |
| daily-oxygen-saturation, daily-respiratory-rate, daily-sleep-temperature-derivations | Raw records; normalized SpO2, respiratory rate and signed skin-temperature delta | health_metrics_and_measurements.readonly |
| nutrition-log, hydration-log | Raw diary records; reviewed meal/water write workflows separately | nutrition.readonly |

Scopes have prefix https://www.googleapis.com/auth/googlehealth.; settings.readonly provides account/device metadata. Writes require separately enabled nutrition permissions.

Use fitbit_read with type, startDate, endDate and optional pageToken. Windows cover 1–14 civil calendar days, end exclusive. Continue with the returned token; a truncated page is not a complete day. Provider raw fields are retained rather than converted into unsupported promises. See [reports](reports.md) for daily units, dates and coverage, and [recovery](recovery.md) for the derived heuristic.

Fitbit Air coverage depends on synchronization, account/API availability and recorded sensor data. Firmware 20001.253.2 was supplied by the first tester; no complete compatibility claim is made from that identifier alone.

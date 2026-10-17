---
name: review
description: Review Fitbit activity, sleep, heart data or compare periods using the connected MCP.
---

Start with fitbit_status. Determine the user's dates and local calendar context. Date ranges are end-exclusive and limited to 14 days. Do not invent today's date or silently use UTC as the user's day.

Use fitbit_summary for daily metrics and observed period statistics, and fitbit_compare for equal-window comparisons. These tools calculate values in code, return units and coverage, and never fill missing days with zero. Choose domains (activity/sleep/heart) to limit requests. fitbit_compare defaults to the preceding equal-length window and uses paired relative day positions. Never describe an observed mean as complete-period coverage when complete=false.

Use fitbit_activity for provider rollup detail. Use fitbit_read for sleep (wake date), heart-rate, daily-resting-heart-rate, daily-heart-rate-variability or exercise. Report unsupported or rejected domains explicitly. If complete=false, continue with nextPageToken as pageToken and the same type/date bounds, or clearly label the batch partial. Raw sources can overlap: do not sum them as daily totals.

For weekly reviews or comparison, fetch equal calendar windows and show observed data separately from interpretations. Use the provided comparison values; percent change from a zero baseline is undefined. There is no proprietary recovery/readiness score. Never turn a missing metric into a value.

Mention source, period, completeness and fetch time. Demo values must always be labelled synthetic. Do not diagnose medical conditions from these tools.

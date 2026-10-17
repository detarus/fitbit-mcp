---
name: review
description: Review Fitbit activity, sleep, heart data or compare periods using the connected MCP.
---

Start with fitbit_status. Determine the user's dates and local calendar context. Date ranges are end-exclusive and limited to 14 days. Do not invent today's date or silently use UTC as the user's day.

Use fitbit_activity for server-reconciled daily steps and activity. Use fitbit_read for sleep (wake date), heart-rate, daily-resting-heart-rate, daily-heart-rate-variability or exercise. Report unsupported or rejected domains explicitly. If complete=false, continue with nextPageToken as pageToken and the same type/date bounds, or clearly label the batch partial. Raw sources can overlap: do not sum them as daily totals.

For weekly reviews or comparison, fetch equal calendar windows and show observed data separately from interpretations. The alpha does not expose a comprehensive normalized weekly score. Only compute simple differences from complete, matching rollup fields; leave a missing value missing.

Mention source, period, completeness and fetch time. Demo values must always be labelled synthetic. Do not diagnose medical conditions from these tools.

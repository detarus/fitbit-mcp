# Changelog

## 0.1.0-alpha.2 — 2026-10-17

- Add normalized daily/period summaries for activity, sleep, resting heart rate and HRV.
- Add equal-window comparisons using paired observed days, with explicit coverage and undefined percentage change from zero.
- Reconcile wearable sources for sleep and daily heart metrics; keep raw reads available.
- Handle duplicate/overlapping sleep sessions, wake-date grouping, explicit offsets, DST, missing and invalid fields.
- Distinguish expired/revoked authorization from transient metadata/refresh failures.
- Persist rotated credentials before metadata lookup and recheck scopes after a transient failure.
- Add loopback OAuth/state/PKCE and independent-process refresh tests.
- Validate the Claude plugin and Codex MCP registration with pinned official CLIs.
- Install packed artifacts outside the repository and test them on macOS, Windows and Ubuntu.

Real Google authorization, device parity, diary presentation and full conversational plugin use remain manual acceptance checks. This alpha is distributed from the repository and CI artifacts; it is not published to npm.

## 0.1.0-alpha.1 — 2026-10-17

- Implement local stdio MCP and synthetic demo.
- Add Desktop OAuth, per-user state and serialized token updates.
- Add bounded raw reads, daily activity rollups and pagination continuation.
- Add meal/water previews, explicit writes, read-back, duplicate prevention and removal of known created records.
- Add shared skills, initial plugin manifests, EN/RU setup instructions and Apache-2.0 license.

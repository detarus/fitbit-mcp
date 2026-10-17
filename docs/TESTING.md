# Alpha testing

Start with the [detailed Russian walkthrough](TESTING.ru.md).

Requirements: Node.js 24 LTS, Git, pnpm 10.20.0.

```sh
git clone https://github.com/detarus/fitbit-mcp.git
cd fitbit-mcp
pnpm install --frozen-lockfile
pnpm check
node dist/cli.js demo-check
```

Demo must print demo=true and googleRequests=0, verified creation and deleted removal. No Google account is used.

For live testing, create your own Google Cloud project, enable Google Health API, configure an External/Testing consent screen, add yourself as a test user, and download a Desktop OAuth client JSON outside the repository. Scopes are listed in [research](research.md) and the Russian walkthrough.

```sh
node dist/cli.js setup --credentials "/absolute/path/client.json" --nutrition-write
node dist/cli.js auth
node dist/cli.js doctor --live
node dist/cli.js install --client codex
node dist/cli.js install --client claude
```

Restart the clients. Call fitbit_status (demo=false), then fitbit_devices, fitbit_activity and fitbit_read for explicit dates. All date windows are end-exclusive, maximum 14 days.

For meals: fitbit_request_id → fitbit_preview_meal → review whole-portion calories and macros, timezone and assumptions → explicit intent → fitbit_commit. Only per-item verified means read-back succeeded. Inspect the Google Health diary. Repeated commits of that operation must not create duplicates. Remove test entries with fitbit_remove after explicit intent.

Unknown outcomes are never automatically resubmitted. Use fitbit_operations to find an ID and fitbit_reconcile to recover stable IDs by read-back. Legacy unknown creates still need manual diary inspection. Use fitbit_preview_correction or fitbit_preview_water_correction for a linked, reviewed replacement; committing deletes originals before saving replacements, so this is not atomic.

The alpha has no normal web/mobile chat connection and no published npm package. The installer registers MCP and copies shared skills for both clients. Official CLI configuration and synthetic tests are separate from real model-driven client validation.

Report only OS/client versions, pass/fail by step and redacted error code/HTTP status. Never share credentials, tokens, callback URLs or health records. See SECURITY.md.

## Summary and comparison checks

```sh
node dist/cli.js report --demo --start 2026-10-01 --end 2026-10-08
node dist/cli.js compare --demo --start 2026-10-08 --end 2026-10-15 --domains activity
```

MCP tools: fitbit_summary and fitbit_compare. Check units, daily quality, observedDays/expectedDays and null totals for incomplete coverage. Comparisons default to the preceding equal-length window and use paired day positions. See [reports.md](reports.md).

AUTH_EXPIRED requires reauthorization. AUTH_NETWORK retains credentials and can be retried when connectivity returns. fitbit_status is explicit about local-only state.

## Alpha.3 recovery and extra vitals

```sh
node dist/cli.js recovery --demo --date 2026-10-17
node dist/cli.js report --demo --start 2026-10-01 --end 2026-10-08 --domains vitals
```

With live OAuth, repeat recovery without --demo for a completed, synced local date. It requires 14 paired historical days (sleep/HRV/resting pulse) in the previous 28, including 3 in the last 7. Null with reasons is expected when data is insufficient. [Formula](recovery.md), [writes/reconciliation](operations.md), [release installation and updating](installation.md).

A score near the personal baseline does not establish healthy sleep or fitness to train. Extra vitals are context only, not inputs to this model. Reconcile failures with the SAME operation ID and inspect both IDs of a correction.

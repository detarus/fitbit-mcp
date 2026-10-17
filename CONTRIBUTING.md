# Contributing

Read [AGENTS.md](AGENTS.md) and [ROADMAP.md](ROADMAP.md). Pick a task ID, describe the behaviour change, and include relevant validation. Update roadmap status and evidence in the same change.

Use Node.js 24 and pnpm 10.20.0. Install with pnpm install --frozen-lockfile once the lockfile is checked in; use pnpm install --no-frozen-lockfile only for initial bootstrapping.

Run pnpm check and pnpm format before submitting. Use synthetic fixtures; never attach credentials, meal photos or personal health records to issues, tests or CI.

Real account tests are opt-in and run locally. Record client/OS versions and an anonymized pass/fail result, not raw responses. Do not mark real-device validation complete from mock tests.

Contributions are submitted under Apache-2.0. Preserve dependency and copied-source attribution; record source provenance before reusing upstream code.

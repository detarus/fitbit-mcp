# fitbit-mcp

Local Fitbit MCP via Google Health API, with read tools, reviewed meal/water writes, and shared skills for Codex and Claude Code.

**Status: [alpha.4 prerelease](https://github.com/detarus/fitbit-mcp/releases/tag/v0.1.0-alpha.4); real-account validation pending. No npm registry publication.** [Validation and tested package artifacts](docs/VALIDATION.md). Planned work is tracked in [ROADMAP.md](ROADMAP.md).

## Try it

Node.js 24 LTS and pnpm 10.20.0 are required.

```sh
git clone https://github.com/detarus/fitbit-mcp.git
cd fitbit-mcp
pnpm install --frozen-lockfile
pnpm check
node dist/cli.js demo-check
node dist/cli.js report --demo --start 2026-10-01 --end 2026-10-08
node dist/cli.js recovery --demo --date 2026-10-17
```

**[Testing on Mac: Russian](docs/TESTING.ru.md) · [English](docs/TESTING.md) · [Summary semantics](docs/reports.md) · [Recovery model](docs/recovery.md) · [Operations](docs/operations.md)**

Demo uses synthetic records and makes no Google requests. Live setup needs your own Google Cloud Desktop OAuth client and browser consent. Keep credentials outside the repository.

## Implemented alpha surface

- Google OAuth with loopback callback, state and PKCE; explicit terminal authorization.
- Status/device metadata, bounded raw reads, daily wearable activity rollups, normalized summaries and code-calculated period comparisons.
- Local immutable meal/water previews, explicit commits, per-item read-back and duplicate protection for the same operation.
- Stable write IDs, read-only reconciliation of interrupted writes/deletes, linked non-atomic meal/water corrections.
- Personal-relative recovery model with a 28-day baseline and explicit factors; SpO2, respiration and skin-temperature deltas.
- One-command MCP plus shared skills installation for Codex/Claude Code; plugin manifests also included.
- Claude Desktop local configuration installer and shared MCP prompts; [setup](docs/desktop.md).
- CI for synthetic checks on macOS, Windows and Linux. Real OAuth/client verification is tracked separately.

Actual API compatibility, data coverage and app presentation still need live validation. Normalized summaries expose activity/sleep/heart/vitals with explicit coverage. Our recovery heuristic is not Fitbit Daily Readiness or a clinically validated score.

For release installation, client setup, updating and removal see [installation](docs/installation.md) and the [compatibility matrix](docs/compatibility.md).

## Meal workflow

Photo or text in a compatible AI client → proposed dishes, portions and approximate macros → local preview → explicit save request → Google Health records → read-back and diary verification.

Values describe the whole dish portion. Photos cannot establish exact weight or hidden ingredients. Fitbit Air has no screen; nutrition records belong in Google Health and the conversation. For ordinary chats see the [client/plan matrix](docs/chat-clients.md); Claude Desktop now has a local installer. Web/mobile remote connections remain a later milestone.

## Privacy

Tokens and write journals stay in a per-user directory with POSIX permissions or Windows ACLs. They are not encrypted by this application. Tool results may be sent to the AI client's provider. No credentials or private account data are needed in CI.

Disconnect removes local tokens; revoke the Google grant separately. Journals retain meal data for reconciliation. Never attach them or meal photos to public issues.

## Project

This repository focuses on Fitbit. A future universal tracker integration will be a separate project.

See [architecture](docs/architecture.md), [research](docs/research.md), [contributing](CONTRIBUTING.md), [security](SECURITY.md) and the maintained [roadmap](ROADMAP.md).

Copyright 2026 Dmitrii Tareev and fitbit-mcp contributors. [Apache-2.0](LICENSE).
Independent project; not affiliated with Google or Fitbit.

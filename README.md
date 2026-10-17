# fitbit-mcp

Local Fitbit MCP via Google Health API, with read tools, reviewed meal/water writes, and shared skills for Codex and Claude Code.

**Status: alpha.2 implementation; real-account validation pending. No published npm release.** [CI passed](https://github.com/detarus/fitbit-mcp/actions/runs/39030626562): build, 23 synthetic tests and demo on macOS/Windows/Linux. Planned work is tracked in [ROADMAP.md](ROADMAP.md).

## Try it

Node.js 24 LTS and pnpm 10.20.0 are required.

```sh
git clone https://github.com/detarus/fitbit-mcp.git
cd fitbit-mcp
pnpm install --frozen-lockfile
pnpm check
node dist/cli.js demo-check
```

**[Testing on Mac: Russian](docs/TESTING.ru.md) · [English](docs/TESTING.md) · [Summary semantics](docs/reports.md)**

Demo uses synthetic records and makes no Google requests. Live setup needs your own Google Cloud Desktop OAuth client and browser consent. Keep credentials outside the repository.

## Implemented alpha surface

- Google OAuth with loopback callback, state and PKCE; explicit terminal authorization.
- Status/device metadata, bounded raw reads, daily wearable activity rollups, normalized summaries and code-calculated period comparisons.
- Local immutable meal/water previews, explicit commits, per-item read-back and duplicate protection for the same operation.
- Removal of known records created by an operation; uncertain outcomes block automatic replay.
- Shared setup, review and nutrition skills; initial Codex/Claude Code plugin manifests.
- CI for synthetic checks on macOS, Windows and Linux. Real OAuth/client verification is tracked separately.

Actual API compatibility, data coverage and app presentation still need live validation. Normalized summaries cover activity, sleep, resting pulse and HRV with explicit coverage; automatic reconciliation of uncertain writes is not finished.

## Meal workflow

Photo or text in a compatible AI client → proposed dishes, portions and approximate macros → local preview → explicit save request → Google Health records → read-back and diary verification.

Values describe the whole dish portion. Photos cannot establish exact weight or hidden ingredients. Fitbit Air has no screen; nutrition records belong in Google Health and the conversation. Ordinary web/mobile ChatGPT/Claude connections are a later milestone.

## Privacy

Tokens and write journals stay in a per-user directory with POSIX permissions or Windows ACLs. They are not encrypted by this application. Tool results may be sent to the AI client's provider. No credentials or private account data are needed in CI.

Disconnect removes local tokens; revoke the Google grant separately. Journals retain meal data for reconciliation. Never attach them or meal photos to public issues.

## Project

This repository focuses on Fitbit. A future universal tracker integration will be a separate project.

See [architecture](docs/architecture.md), [research](docs/research.md), [contributing](CONTRIBUTING.md), [security](SECURITY.md) and the maintained [roadmap](ROADMAP.md).

Copyright 2026 Dmitrii Tareev and fitbit-mcp contributors. [Apache-2.0](LICENSE).
Independent project; not affiliated with Google or Fitbit.

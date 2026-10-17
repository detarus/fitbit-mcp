# Architecture / ADR-001

Date: 2026-10-17. Status: accepted for the alpha.

## Scope

Fitbit through Google Health API v4. Support for other tracker providers belongs to another repository. No provider abstraction framework is included.

## Stack

Node.js 24 LTS, TypeScript strict, official MCP SDK 1.x, Zod 4, Google auth library 10.x, pnpm 10 and Vitest. Exact direct dependency versions are in package.json; CI generates the initial pnpm lock, verifies the matrix, and saves it before normal frozen installs.

A single package in a pnpm workspace is sufficient for the alpha. Splitting packages before they need independent releases would increase installation complexity.

## Boundaries

- schema.ts: validated dates, supported types, meal/water contracts and API mapping.
- storage.ts: per-user directory, atomic JSON replacement, cross-process locks.
- auth.ts: Desktop OAuth, browser callback, credentials and refresh.
- api.ts: restricted Google REST calls and explicitly synthetic demo backend.
- operations.ts: durable previews and per-item write state machine.
- server.ts: MCP tools and safe error envelopes.
- cli.ts: setup/auth/doctor/client registration and stdio lifecycle.
- skills/: reusable instructions; root manifests package them for both clients.

No arbitrary HTTP proxy, arbitrary file tool or arbitrary API mutation is exposed.

## Credentials and local data

macOS uses ~/Library/Application Support/fitbit-mcp, Linux uses XDG_DATA_HOME or ~/.local/share/fitbit-mcp, and Windows uses LOCALAPPDATA/fitbit-mcp. FITBIT_MCP_HOME is an explicit local override.

POSIX directories are mode 0700, files 0600. Windows restricts directory inheritance and grants the current account access via icacls. This is access control, not application-level encryption or an OS credential-vault implementation. Real Windows ACL behaviour and OAuth must still be verified. Full-disk encryption remains controlled by the OS.

The directory contains OAuth configuration, tokens and minimal write journals with meal data. Do not sync it to a public repository. Disconnect deletes local tokens, does not revoke Google's grant, and preserves journals. Revoke remotely through Google Account settings. Journals are needed for duplicate prevention and reconciliation.

## Write semantics

Preview is a local immutable operation keyed by a UUID. Each occurrence of a meal gets a new UUID; retries reuse it. Setup, sign-in, disconnect and write operations share a cross-process session lock so account changes cannot race a write. The journal binds to a hash of OAuth client plus Google Health user identity, and demo/live filenames are separate.

Each item moves pending → sending → created → verified. Persist sending before the external call. Unknown outcomes and crash-persisted sending states are never blindly replayed. Known created records can be read again without creating them again. A 24-hour age limit applies only to pending items.

Removal is limited to resource names recorded by that operation. It checks read-back for 404. Manual-food corrections require removing known old entries and previewing a new meal; there is no atomic replace. Automatic recovery from an unknown write/delete is intentionally not implemented in this alpha; inspect the diary and resolve manually before a new submission.

Requests with a changed payload cannot reuse an existing UUID. Previews should be reviewed before commit. The client must pass explicit intent to commit/remove; the server cannot independently prove the user's conversational intent.

Read retries are bounded, honour short Retry-After delays, and do not retry early for a long delay. Mutating POSTs are not automatically retried, including after HTTP errors. Error bodies, tokens and OAuth secrets are not returned by tools.

## Reads and time

Raw reads return provider fields and an explicit pagination completeness flag. Dense streams return a continuation token after 500 points; clients can continue using the same type and date range. Missing is never replaced with zero. Civil-date ranges are end-exclusive and bounded to 14 days. Sleep uses wake dates. Daily activity uses Google's civil-day rollups and google-wearables; raw samples are not summed.

This alpha does not yet provide a complete normalized daily/weekly health summary. Device compatibility and API responses must be verified on the real account.

## Distribution

For the alpha, build from the repository and register the absolute Node executable and dist/cli.js with Codex/Claude Code. Plugins use the same installed binary and shared skill directory. The package is private to prevent accidental npm publication before release checks.

No HTTP server for web/mobile chats is exposed. Demo mode makes no Google requests and uses synthetic data and an isolated temporary journal.

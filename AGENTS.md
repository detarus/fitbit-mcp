# Working on fitbit-mcp

## Project scope

This repository is the Fitbit-specific MCP project using Google Health API. A universal integration for other fitness trackers belongs to a separate future project.

Read README.md and ROADMAP.md before making changes. Check for more specific instructions in the directories you touch.

## Keep the roadmap current

The user requested a living, actionable plan. ROADMAP.md is the source of truth.

- Set the relevant stable task ID to IN PROGRESS when work starts.
- Update task status, acceptance evidence, last-updated date, and current focus in the same PR or set of commits as the implementation.
- Mark DONE only after the row's acceptance criteria are met. Distinguish synthetic tests, CI checks, and real-account validation.
- Record blockers with a concrete cause and next action. Do not imply that unavailable environments or unrun tests passed.
- Keep README's roadmap section linked to ROADMAP.md instead of duplicating its checklist.
- Update the plan during active project work; no background monitoring is configured.

## Data and validation

Never commit OAuth secrets, tokens, personal health records, or meal photos. Use synthetic fixtures and redact diagnostics.

Preserve the distinction between measured values, estimates, missing data, and unsupported capabilities. Keep read permissions and category-specific write permissions explicit.

Verify external write results and account for duplicate submissions, partial failures, and uncertain network outcomes. Do not blindly retry non-idempotent writes.

## Current implementation status

The repository initially contains planning documents and an Apache-2.0 license. Consult the latest code and ROADMAP.md for actual implementation status; do not present planned commands or features as available.

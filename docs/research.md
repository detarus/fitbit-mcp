# API and implementation research

Checked: 2026-10-17. These are source/documentation findings, not live-account validation.

## Decision

Build a small original TypeScript implementation. No code has been copied from the projects below. Google OAuth uses Google's official authentication library; API calls use the documented v4 REST surface.

| Candidate | License and implementation | Fit for this project |
| --- | --- | --- |
| [BerkKilicoglu/google-health-fitbit-mcp](https://github.com/BerkKilicoglu/google-health-fitbit-mcp) | MIT. Reviewed README, package.json, LICENSE, google-health-client.ts and oauth-loopback.ts | Broad local TypeScript tools and summaries. The inspected client describes nutrition writes as planned/unverified; its shared retry path needs separate evaluation for mutating requests. Not adopted as our core. |
| [AbemKW/fitbit-mcp](https://github.com/AbemKW/fitbit-mcp) | MIT. Reviewed README, LICENSE and client.py | Fitbit Air-focused Python reads; Windows credential-store requirement and deliberately read-only scope do not meet our cross-platform write workflow. Not adopted. |

Upstream claims about API behaviour are hypotheses to verify, not substitutes for Google's current reference. If future work copies any code, retain the upstream license and attribution and record the exact source/revision.

## Primary API sources and implementation implications

- [Google Health setup](https://developers.google.com/health/setup): API enablement, OAuth client, consent screen and test-user steps. Start with the user's own Desktop OAuth client; no common project client is distributed.
- [Scopes](https://developers.google.com/health/scopes): separate read and write grants; handle partial consent. Initial reader requests activity, health metrics, sleep, nutrition and settings; nutrition writes are optional.
- [OAuth desktop flow](https://developers.google.com/identity/protocols/oauth2/native-app) and [Google Node authentication library](https://github.com/googleapis/google-auth-library-nodejs): use system browser, loopback redirect, state and S256 PKCE. Refresh through the official library; serialize local token updates.
- [List](https://developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints/list): closed-open filters, pagination, special sleep filtering by session end. Explicit dataSourceFamily is not supported by sleep list. Raw streams may overlap and must not be summed.
- [Daily rollup](https://developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints/dailyRollUp): civil date range, reconciled wearable activity, missing buckets distinct from measured zero. Rollup is a POST but is semantically read-only.
- [Identity](https://developers.google.com/health/reference/rest/v4/users/getIdentity): establish the healthUserId so an old draft cannot be committed after switching accounts.
- [Nutrition](https://developers.google.com/health/data-types/nutrition): nutrition-log and hydration-log support writes. Protein is represented as a nutrient quantity; energy uses kcal and macros use grams. Manual-food entries cannot be patched: correction requires deletion and recreation. Delete uses batchDelete. Food catalogue resources themselves are read-only.
- [Google Health verification](https://developers.google.com/health/app-verification) and [OAuth exceptions](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification): restricted scopes have verification requirements; personal-use exceptions must be evaluated for the actual deployment. Open source does not remove these requirements.
- [Refresh expiry](https://developers.google.com/identity/protocols/oauth2#expiration): Testing consent commonly means a seven-day refresh grant. Never promise unattended permanent access.
- [Fitbit Air](https://support.google.com/googlehealth/answer/17033101?hl=en): screenless device. Nutrition results belong in the app and AI conversation, not on a tracker display.

## Remaining live checks

OAuth grant availability, exact daily-metric filter names, account/device coverage, nutrition read-back representation, diary presentation, and create/delete completion semantics require the owner's Google account. A passing synthetic test cannot close those tasks.

## Client packaging sources

- [OpenAI plugin packaging](https://developers.openai.com/plugins/build/plugins)
- [Codex MCP](https://developers.openai.com/codex/mcp)
- [Claude plugin manifest](https://code.claude.com/docs/en/plugins-reference)
- [Claude MCP](https://code.claude.com/docs/en/mcp)

Ship a directly testable local MCP first. Plugin skill files are shared; client installation must be tested separately and must not register duplicate servers.

## Anonymous portion representation

The nutrition guide's example includes serving.amount alone, but the resource reference marks serving.foodMeasurementUnit required when a serving object is supplied. The alpha omits this optional serving object and records portion grams in foodDisplayName. Macro values still apply to the whole portion. This avoids inventing a food measurement-unit resource ID; verify the resulting diary display live.

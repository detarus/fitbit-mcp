# Alpha validation

Last updated: 2026-10-17.

## First CI matrix

[Run 39030383054](https://github.com/detarus/fitbit-mcp/actions/runs/39030383054), implementation commit 964e6fbe3522424c8adcee6d9fe647e40e2d2675:

- macOS, Ubuntu and Windows: TypeScript checking and build passed.
- All three platforms: 18 synthetic tests passed, including a real stdio MCP client/server connection.
- All three platforms: demo meal create/read/repeat/delete smoke check passed.
- Package dry-run passed.
- The initial dependency lockfile was generated and committed by CI.

These results do not establish real Google OAuth, device data parity, diary visibility or Codex/Claude plugin installation. No personal credentials or health records were used.

A subsequent change adds a shared session lock against account-switch/write races and further authentication tests; its CI result must be checked separately.

## Manual acceptance still required

Follow [TESTING.ru.md](TESTING.ru.md) or [TESTING.md](TESTING.md). Report only environment versions and pass/fail/error codes.

- Mac: real Desktop OAuth and token renewal.
- Fitbit Air: seven-day read comparison with the mobile app.
- Meal and water: create, read-back, visible diary contents, duplicate retry, removal.
- Codex and Claude Code: actual registration and skill/plugin use.
- Windows/Linux: real OAuth and per-user storage behaviour.

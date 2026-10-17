# Alpha validation

Last updated: 2026-10-17.

## Current tested implementation

Implementation commit: [383fd0d](https://github.com/detarus/fitbit-mcp/commit/383fd0d55c932ee13a98eee0d5ab4d0942418690).
CI: [run 39030626562](https://github.com/detarus/fitbit-mcp/actions/runs/39030626562).

**Result: passed on macOS, Windows and Ubuntu.** Typechecking, build, 23 synthetic tests, demo-check and package dry-run all passed. Plugin manifests are included in the package contents. Synthetic tests cover schema validation, date boundaries, macro mapping, dense-stream continuation, API error handling, write journals, repeated commits, crash states, account binding, session serialization, auth setup/disconnect, package manifests, and a real stdio MCP client/server roundtrip.

A shared session lock prevents setup, sign-in or disconnect from switching accounts during a write. Portion weight is preserved in the manual food display name; the optional serving object is omitted rather than inventing a catalogue unit ID. Created record time and macros are checked against the preview.

The initial pnpm lockfile was generated and committed by successful CI; subsequent installs use frozen-lockfile.

## Previous checks

- [39030383054](https://github.com/detarus/fitbit-mcp/actions/runs/39030383054): 18 tests on macOS, Windows and Ubuntu.
- [39030483964](https://github.com/detarus/fitbit-mcp/actions/runs/39030483964): 22 tests on all three OSes, including account-switch serialization and plugin package contents.

## What remains unverified

No Google credentials or personal health records were used. Synthetic checks do not establish real Google OAuth, device-data parity, diary visibility or actual Codex/Claude plugin installation.

Follow [TESTING.ru.md](TESTING.ru.md) or [TESTING.md](TESTING.md).

1. Mac: Desktop OAuth, doctor --live, token renewal.
2. Fitbit Air: compare seven days against the mobile app.
3. Meal/water: creation, read-back, visible diary contents, duplicate retry, removal.
4. Codex and Claude Code: registration and actual skill/plugin use.
5. Windows/Linux: real OAuth and per-user storage behaviour.

Report only OS/client versions, pass/fail and error codes. The package is an alpha built from the repository; it is not published to npm.

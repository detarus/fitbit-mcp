# Validation

Last updated: 2026-10-17.

## Alpha.2 implementation

Commit: [728808f](https://github.com/detarus/fitbit-mcp/commit/728808f68782a4aae923b20d583f78c5a7f5b8d7).
CI: [run 39032656262](https://github.com/detarus/fitbit-mcp/actions/runs/39032656262).

### Automated evidence

- Typechecking and build.
- 44 synthetic tests: schema validation, calendar/DST boundaries, activity units, explicit zeros and gaps, sleep duplicates/overlaps, paired comparisons and partial domains.
- A real stdio MCP client/server session exercises meal writes, summaries and comparisons with synthetic data.
- Loopback OAuth tests cover state, S256 PKCE, timeout and partial consent without contacting Google.
- Refresh tests cover rotation, metadata failure recovery, revoked grants, error redaction and serialization across two independent Node processes.
- A real npm tarball is installed outside the repository; its CLI and demo write/read/delete cycle are exercised without Google.
- Claude Code 2.1.302 validates the plugin in strict mode.
- Codex 0.163.0 registers and reads back the MCP configuration.

**Final result: all jobs passed.** macOS, Windows and Ubuntu each passed build/typecheck, all 44 tests, demo-check, and installation of the actual tarball outside the repository. Client configuration checks run on Ubuntu; that is not proof of an authenticated conversation or plugin installation on every OS.

### Downloadable package

The CI run's Artifacts section contains package-macos-latest, package-windows-latest and package-ubuntu-latest. Each ZIP contains a tested detarus-fitbit-mcp-0.1.0-alpha.2.tgz. GitHub sign-in may be required to download artifacts. This is not an npm registry publication.

After extracting the ZIP, install its tarball with npm install --global /absolute/path/detarus-fitbit-mcp-0.1.0-alpha.2.tgz. Node.js 24 is required; installation fetches runtime dependencies from npm. Run fitbit-mcp demo-check first.

## Previous checks

- [39030626562](https://github.com/detarus/fitbit-mcp/actions/runs/39030626562): alpha.1, 23 tests, build/demo/package dry run on macOS, Windows and Ubuntu.
- [39032540682](https://github.com/detarus/fitbit-mcp/actions/runs/39032540682): alpha.2 reports and auth flow, 43 tests and real packed installation on all three OSes, actual CLI configuration checks.

## Manual acceptance still open

No Google credentials or personal health records were used in CI. Follow [TESTING.ru.md](TESTING.ru.md) or [TESTING.md](TESTING.md).

1. Mac: actual Desktop OAuth, doctor --live and token renewal.
2. Fitbit Air: compare seven days against the mobile app and verify normalized units/coverage.
3. Meal/water: create, read-back, visible diary contents, retry without duplicates and removal.
4. Codex and Claude Code: authenticated conversational use and plugin skills.
5. Windows/Linux: real OAuth, browser integration and client registration.

Report only OS/client versions, pass/fail and error codes. Never share credentials, tokens or health records.

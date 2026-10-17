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

## Alpha.3 — 2026-10-17

Implementation commit: [c87c66c1ae808537506c8d806f55f09da125e037](https://github.com/detarus/fitbit-mcp/commit/c87c66c1ae808537506c8d806f55f09da125e037).
[CI 39039701378](https://github.com/detarus/fitbit-mcp/actions/runs/39039701378): all seven jobs successful.

- macOS, Windows, Ubuntu: locked dependency installation, typecheck/build, 64 synthetic tests in 11 files, real stdio MCP roundtrip, demo-check, installed tarball outside checkout and recovery demo.
- Claude Code 2.1.302 and Codex 0.163.0 on all three OSes: register MCP and install three namespaced skills, repeat installation, verify unchanged managed files. Claude strict plugin validation and Codex configuration read-back passed.
- Recovery tests: baseline/target separation, paired/recent coverage, missing/zero data, conflicts, outliers, directions, reproducibility, bounded fetch windows and explicit provider failures.
- Operation tests: lost create/delete responses, known-ID read-back, absence ambiguity, conflicting content, partial corrections, competing corrections, restart/concurrency and continuation beyond 24-hour draft expiry.
- Vitals: daily SpO2/respiration, signed skin-temperature delta, absent baseline and explicit invalid saturation.
- Cross-platform fixes found by CI: Windows CRLF normalization and Claude npm entrypoint detection via package metadata. Official CLI installation used its normal package setup.

Published [v0.1.0-alpha.3 prerelease](https://github.com/detarus/fitbit-mcp/releases/tag/v0.1.0-alpha.3) after the six test/config jobs. Contains `detarus-fitbit-mcp-0.1.0-alpha.3.tgz` (55949 bytes) and SHA256SUMS. Tarball SHA-256 reported by GitHub: `3f998982bb96f699bd3d0393e2761723b276dd2fd898e9ba95098c1e6eb97e94`.

No private Google account, Fitbit device, real OAuth consent or personal health data was used. Model-driven invocation/image flows, Google acceptance of client-provided IDs, app diary rendering and actual Fitbit Air parity remain unverified. A custom recovery heuristic is not clinically validated. These limitations keep live-account roadmap tasks open.

## Alpha.4 — 2026-10-17

Implementation: [5b391a85e2df15e52ed386b1d66251113bdf13fe](https://github.com/detarus/fitbit-mcp/commit/5b391a85e2df15e52ed386b1d66251113bdf13fe).
CI: [39067979468](https://github.com/detarus/fitbit-mcp/actions/runs/39067979468).

- 71 synthetic tests in 13 files: prior recovery/write/auth coverage plus private-state link and permission checks, Windows explicit-grant removal, Desktop config preservation/conflicts, prompt discovery, cancellation, repeated dates and water correction.
- Installed package outside checkout: CLI/demo/recovery and Desktop configuration with repeated installation.
- Actual pinned Codex/Claude Code registration and skill installation on all three operating systems.
- Windows regression discovered and fixed: avoid PowerShell Security module auto-loading when launched from PowerShell 7; apply ACLs through the Windows PowerShell .NET filesystem API.
- Desktop UI itself, actual Google account, real photos and diary display remain unverified. Read the [scenario matrix](scenarios.md), [Desktop test](desktop.md) and [remaining roadmap dependencies](../ROADMAP.md).

All six OS/client jobs passed; GitHub prerelease published: [alpha.4](https://github.com/detarus/fitbit-mcp/releases/tag/v0.1.0-alpha.4). Package detarus-fitbit-mcp-0.1.0-alpha.4.tgz, 64048 bytes; SHA-256 53b4c6599ca0425008475f27cc2524b6284d2852b20d21cbc2a8eda771fbc11c. SHA256SUMS is included in the release. No npm registry publication.

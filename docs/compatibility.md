# Compatibility matrix

Last checked: 2026-10-17. Alpha.3 is a testing prerelease. CI evidence and live evidence are separate.

| Component | Automated evidence | Live/account evidence |
| --- | --- | --- |
| macOS, Windows, Ubuntu; Node 24 | Build, types, 64 synthetic unit + stdio tests and installed npm tarball passed | OAuth on these OSes pending |
| Claude Code 2.1.302 | Strict plugin validation, MCP + skill installation and repeat setup on all three OSes | Model tool selection, image flow and real diary pending |
| Codex 0.163.0 | MCP + skill installation and repeat setup on all three OSes | Model tool selection and real diary pending |
| Fitbit Air, firmware 20001.253.2 (user-reported) | Synthetic API fixtures only | Actual device/account parity pending |
| Google Health v4 | Read/write schemas checked against current docs; transport mocks | API project access, consent, scopes, returned fields and diary rendering pending |
| Recovery personal-relative-v1 | Formula invariants, gaps, duplicate dates, outliers, bounded fetch windows | No clinical validation or live calibration |
| SpO2 / respiration / skin delta | Schema normalization and demo | Availability depends on device/account/region and sync |
| Meal/water writes and corrections | Journal, stable ID, interrupted create/delete and partial replacement tests | Server acceptance of IDs, permissions and app representation pending |
| Ordinary ChatGPT/Claude web/mobile | No implementation in this release | Separate future milestone |

Dependencies are pinned in package.json and pnpm-lock.yaml. The runtime supports Node >=24 <25; other majors are not claimed. The generic JS tarball contains no device driver and is tested per OS; platform tooling and the official clients can have additional requirements.

The known reported firmware number is not an OS version. This project does not yet claim a particular macOS release, CPU architecture, or Fitbit firmware as live-tested. CI host details are in Actions runner logs.

Do not interpret a successful local status, CI check, HTTP response or plugin manifest as evidence that a specific Fitbit account works.

Evidence: [CI 39039701378](https://github.com/detarus/fitbit-mcp/actions/runs/39039701378), tested source commit [c87c66c](https://github.com/detarus/fitbit-mcp/commit/c87c66c1ae808537506c8d806f55f09da125e037). Seven jobs succeeded, including prerelease publication. The release contains the tested Ubuntu tarball; the same package workflow installs and tests the tarball on all three OSes.

# Compatibility matrix

Last checked: 2026-10-17. Alpha.4 is a testing prerelease. CI evidence and live evidence are separate.

| Component | Automated evidence | Live/account evidence |
| --- | --- | --- |
| macOS, Windows, Ubuntu; Node 24 | Build, types, 71 synthetic unit + stdio tests and installed npm tarball passed | OAuth on these OSes pending |
| Claude Code 2.1.302 | Strict plugin validation, MCP + skill installation and repeat setup on all three OSes | Model tool selection, image flow and real diary pending |
| Codex 0.163.0 | MCP + skill installation and repeat setup on all three OSes | Model tool selection and real diary pending |
| Fitbit Air, firmware 20001.253.2 (user-reported) | Synthetic API fixtures only | Actual device/account parity pending |
| Google Health v4 | Read/write schemas checked against current docs; transport mocks | API project access, consent, scopes, returned fields and diary rendering pending |
| Recovery personal-relative-v1 | Formula invariants, gaps, duplicate dates, outliers, bounded fetch windows | No clinical validation or live calibration |
| SpO2 / respiration / skin delta | Schema normalization and demo | Availability depends on device/account/region and sync |
| Meal/water writes and corrections | Journal, stable ID, interrupted create/delete and partial replacement tests | Server acceptance of IDs, permissions and app representation pending |
| Claude Desktop macOS/Windows | Configuration merge/backup/conflict tests and installed-package setup; shared MCP prompts over stdio | Desktop UI, photos and actual account pending |
| Ordinary ChatGPT/Claude web/mobile | No implementation in this release | Separate future milestone |

Dependencies are pinned in package.json and pnpm-lock.yaml. The runtime supports Node >=24 <25; other majors are not claimed. The generic JS tarball contains no device driver and is tested per OS; platform tooling and the official clients can have additional requirements.

The known reported firmware number is not an OS version. This project does not yet claim a particular macOS release, CPU architecture, or Fitbit firmware as live-tested. CI host details are in Actions runner logs.

Do not interpret a successful local status, CI check, HTTP response or plugin manifest as evidence that a specific Fitbit account works.

Evidence: [CI 39067979468](https://github.com/detarus/fitbit-mcp/actions/runs/39039701378), tested source commit [5b391a8](https://github.com/detarus/fitbit-mcp/commit/5b391a85e2df15e52ed386b1d66251113bdf13fe). Seven jobs succeeded, including prerelease publication. The release contains the tested Ubuntu tarball; the same package workflow installs and tests the tarball on all three OSes.

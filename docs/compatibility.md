# Compatibility matrix

Last checked: 2026-10-17. Alpha.3 is a testing prerelease. CI evidence and live evidence are separate.

| Component | Automated evidence | Live/account evidence |
| --- | --- | --- |
| macOS, Windows, Ubuntu; Node 24 | Build, types, synthetic unit + stdio tests, installed npm tarball; alpha.3 run pending | OAuth on these OSes pending |
| Claude Code 2.1.302 | Strict plugin validation and MCP registration via official CLI | Model tool selection, image flow and real diary pending |
| Codex 0.163.0 | MCP registration via official CLI | Model tool selection and real diary pending |
| Fitbit Air, firmware 20001.253.2 (user-reported) | Synthetic API fixtures only | Actual device/account parity pending |
| Google Health v4 | Read/write schemas checked against current docs; transport mocks | API project access, consent, scopes, returned fields and diary rendering pending |
| Recovery personal-relative-v1 | Formula invariants, gaps, duplicate dates, outliers, bounded fetch windows | No clinical validation or live calibration |
| SpO2 / respiration / skin delta | Schema normalization and demo | Availability depends on device/account/region and sync |
| Meal/water writes and corrections | Journal, stable ID, interrupted create/delete and partial replacement tests | Server acceptance of IDs, permissions and app representation pending |
| Ordinary ChatGPT/Claude web/mobile | No implementation in this release | Separate future milestone |

Dependencies are pinned in package.json and pnpm-lock.yaml. The runtime supports Node >=24 <25; other majors are not claimed. The generic JS tarball contains no device driver and is tested per OS; platform tooling and the official clients can have additional requirements.

The known reported firmware number is not an OS version. This project does not yet claim a particular macOS release, CPU architecture, or Fitbit firmware as live-tested. CI host details are in Actions runner logs.

Do not interpret a successful local status, CI check, HTTP response or plugin manifest as evidence that a specific Fitbit account works.

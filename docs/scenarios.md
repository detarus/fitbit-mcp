# Scenario evidence

All automated records are synthetic. Model behavior, real photos, Google writes and app diary rendering remain manual acceptance items.

| Scenario | Automated evidence |
| --- | --- |
| Shared setup/review/nutrition instructions | MCP listPrompts/getPrompt over real stdio; copied setup skill links work outside checkout |
| Same meal on another date | operations.test.ts: separate request/resource IDs |
| Cancel untouched draft | mcp.test.ts: cancellation then rejected commit |
| Permissions removed after preview | operations.test.ts: commit blocked, pending state retained |
| Empty exercise period | mcp.test.ts: explicit empty provider list |
| Water correction | mcp.test.ts: linked replacement and verified deletion of original |
| Portion correction | operations.test.ts: linked meal replacement and partial failure recovery |
| Duplicate request / interrupted response | operations.test.ts: persisted ID and GET reconciliation |
| Concurrent clients | operations.test.ts locks; auth-flow.test.ts independent-process refresh |
| Clean consumer installation | package-smoke.mjs: installed tarball outside checkout, demo/recovery and Desktop config |
| Actual CLI configuration | client-smoke.mjs: Codex and Claude Code, repeated installation |

Remaining manual procedure: [TESTING.ru.md](TESTING.ru.md), [Desktop](desktop.md). Report only versions, pass/fail and sanitized error codes, not private records.

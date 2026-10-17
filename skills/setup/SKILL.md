---
name: setup
description: Set up or diagnose a local Fitbit MCP connection.
---

Call fitbit_status first. Clearly distinguish synthetic demo mode, local configuration, stored authorization and live reachability. Use fitbit_devices only when the user requests live diagnosis.

For missing configuration, refer to docs/TESTING.ru.md or docs/TESTING.md. The user downloads Desktop OAuth credentials and authorizes in a system browser from their terminal. Never request a client secret, token or callback URL in chat. Do not attempt to read local credential files with other tools.

Nutrition writes require setup with --nutrition-write and reauthorization. The grant can expire in Testing. Missing scope, no records and unsupported types are different outcomes. Never claim the account works based only on a local token file.

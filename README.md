# fitbit-mcp

A cross-platform, local MCP server for Fitbit data via the Google Health API, with planned plugins and skills for Codex and Claude Code.

**Status: planning and initial setup. No runnable server or published package is available yet.** Features below are planned and require implementation and validation against real accounts.

## Scope

This project focuses on Fitbit, including Fitbit Air. A broader integration for multiple fitness-tracker providers will be a separate project.

## Planned capabilities

- Read available activity, sleep, heart-rate, HRV, and workout data.
- Produce daily summaries, weekly reviews, and period comparisons.
- Record meals with individual dishes, portions, calories, protein, fat, and carbohydrates.
- Log water intake and correct or remove entries created by this integration where supported.
- Accept structured input from AI clients working with photos, text, or food labels.
- Discover account capabilities and granted permissions instead of assuming every metric is available.

Data availability depends on the device, account, permissions, and Google Health API support.

## Meal logging workflow

1. Share a meal photo, description, or nutrition label with a compatible AI client.
2. Review the proposed dishes, portions, and estimated nutritional values.
3. Ask the client to save the meal.
4. The MCP server validates and writes the entries, then checks the result.

Photo-based nutritional values are estimates. Image interpretation belongs to the AI client; the server handles structured data, validation, and API operations.

Food entries are written to Google Health. Fitbit Air has no display; showing dish details on the tracker is outside this project's scope. App presentation must be verified during integration testing.

## Architecture and proposed stack

- TypeScript with strict typing and a supported Node.js LTS release.
- Official MCP TypeScript SDK and Zod validation.
- Local stdio transport first.
- Shared server with separate Codex and Claude Code plugin packages.
- Vitest and GitHub Actions checks on macOS, Windows, and Linux.

Local MCP configuration does not automatically connect ordinary web or mobile chats. ChatGPT and Claude chat integration is a separate milestone, subject to each client's connection and permission requirements.

## Roadmap

- [ ] Establish project structure, CI, and architecture decisions.
- [ ] Implement Google OAuth setup, capability discovery, and local credential storage.
- [ ] Validate reading real Fitbit data.
- [ ] Validate meal and hydration writes, read-back, and removal of test entries.
- [ ] Implement write previews, duplicate prevention, and partial-failure handling.
- [ ] Package Codex and Claude Code plugins and workflow skills.
- [ ] Verify installation and authentication on macOS, Windows, and Linux.
- [ ] Publish an initial release with English and Russian setup documentation.
- [ ] Add supported chat connections and the photo-to-meal workflow.

## Privacy and access

The intended default is local execution, with credentials stored outside the repository and never returned by MCP tools. Health data returned to an AI client may be sent to that client's model provider.

Write access will be opt-in by category. Google OAuth configuration, verification requirements, and token lifetime constraints must be documented before release.

Never commit OAuth credentials, access or refresh tokens, personal health data, or meal photos. Use synthetic data in issues and tests.

## Contributing

Design feedback and use cases are welcome through GitHub issues. Please describe the client, operating system, expected workflow, and relevant API constraints without including secrets or personal health records.

## License

Copyright 2026 Dmitrii Tareev and fitbit-mcp contributors.

Licensed under the [Apache License, Version 2.0](LICENSE).

This is an independent project and is not affiliated with or endorsed by Google or Fitbit.

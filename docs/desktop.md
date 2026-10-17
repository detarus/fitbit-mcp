# Claude Desktop setup

Requires macOS or Windows, Claude Desktop and Node.js 24. Install the release package using [installation.md](installation.md). Quit Claude Desktop before changing its configuration.

For a synthetic trial without Google:
```sh
fitbit-mcp install --client claude-desktop --demo
```

Restart Claude Desktop, inspect the fitbit tools and ask it to call fitbit_status. The result must say demo. Ask for a water preview, review it, explicitly request saving, then inspect its operation. Demo changes only temporary synthetic data.

For real data, complete terminal OAuth using [TESTING.ru.md](TESTING.ru.md), then:
```sh
fitbit-mcp install --client claude-desktop
```

A prior demo fitbit entry deliberately conflicts with live mode. Inspect claude_desktop_config.json, remove only mcpServers.fitbit, save, then rerun the live install command. Other servers and preferences are retained. Existing configuration backups are reported by the installer. Invalid JSON and conflicting entries are never silently overwritten.

Configuration locations:
- macOS: ~/Library/Application Support/Claude/claude_desktop_config.json
- Windows: %APPDATA%/Claude/claude_desktop_config.json

The installer registers absolute Node and script paths. Keep that Node/package installation available; repeat setup after moving it. For removal, quit Desktop and remove only its fitbit server entry. For rollback, restore the reported backup after reviewing any subsequent edits.

MCP prompts fitbit_setup, fitbit_review and fitbit_nutrition expose the shared instructions where supported by the client. They are distinct from CLI slash-command skills; no Desktop skill directory is installed.

Try a meal photograph only after basic tool access works: request dishes, portions, approximate macros and assumptions; correct them; create a preview; explicitly save; verify the diary. Data goes to Google Health, and device display behavior is not guaranteed. Photo recognition and this app UI have not been exercised in CI. Local Desktop configuration does not connect Claude web/mobile or ChatGPT; see [client research](chat-clients.md).

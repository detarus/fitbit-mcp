# Install, update and remove

Requires Node.js 24 LTS, npm, and the official Codex or Claude Code CLI on your computer. The npm registry package is not published; install the release tarball.

## Release package

Download `detarus-fitbit-mcp-0.1.0-alpha.4.tgz` and `SHA256SUMS` from the [alpha.4 release](https://github.com/detarus/fitbit-mcp/releases/tag/v0.1.0-alpha.4) into one directory. Alpha is intended for testing; real-account validation is pending. Check the file hash against SHA256SUMS:

- macOS: `shasum -a 256 detarus-fitbit-mcp-0.1.0-alpha.4.tgz`
- Linux: `sha256sum -c SHA256SUMS`
- Windows PowerShell: `Get-FileHash .\detarus-fitbit-mcp-0.1.0-alpha.4.tgz -Algorithm SHA256`

Then, from that directory on any OS:

```sh
npm install --global ./detarus-fitbit-mcp-0.1.0-alpha.4.tgz
fitbit-mcp demo-check
fitbit-mcp recovery --demo --date 2026-10-17
fitbit-mcp install --client codex
fitbit-mcp install --client claude
```

Use the install line only for clients you use. Restart them and ask to call `fitbit_status`. The default server is live, not demo; a fresh account will report not configured until you complete setup. Installation registers the stdio server and copies shared skills as `fitbit-setup`, `fitbit-review`, `fitbit-nutrition`. Codex uses the user's `.agents/skills`, Claude uses `.claude/skills`. Call `$fitbit-review` in Codex or `/fitbit-review` in Claude Code.

The command installs managed skills only under its own three names. It refuses to overwrite unowned or locally edited skill files; back up and move those folders if you want the packaged version. Repeating the command updates unchanged managed skills. Claude may require removing an older `fitbit` MCP entry if it points to a different executable; inspect it before `claude mcp remove fitbit --scope user`.

If MCP is already registered, use `fitbit-mcp install --client codex --skills-only` (or claude). Avoid enabling the bundled plugin and the standalone registration together: they would start duplicate server instances.

Package installation downloads dependencies from npm; it is not an offline bundle. Use a per-user Node installation if global npm permissions fail; do not run the health application as administrator.

## Live setup

Follow [Russian Mac test guide](TESTING.ru.md) or [English test guide](TESTING.md) to create a Desktop OAuth client and authorize in your local browser. Never send credentials to chat. Google Health API project availability is a separate prerequisite; see [research](research.md).

For recovery: request a completed, synced local wake date. Fourteen paired days in the preceding 28 are required, with 3 in the last 7; otherwise no score is returned. [Formula and limitations](recovery.md).

## Plugin alternative

The npm tarball includes `.claude-plugin`, `.codex-plugin`, `.mcp.json`, and shared skills. You can load the installed package directory through your client's local-plugin mechanism after global installation; its MCP launcher expects `fitbit-mcp` on PATH. Claude Code's local session command is `claude --plugin-dir /absolute/path/to/package`. Codex plugin deployment remains dependent on the client version; the standalone installer above is the tested installation path. No marketplace listing is claimed.

The source checkout also works: `pnpm install --frozen-lockfile`, `pnpm build`, then `node dist/cli.js install --client codex` or claude. Keep the checkout at the registered path.

## Update and rollback

Stop/restart active client sessions around updates. Download a specific new release and its checksum, verify, then repeat `npm install --global ./<new-package>.tgz` and both desired `fitbit-mcp install` commands. Registration uses the installed package's absolute Node and script paths, so rerun it after changing Node installations. If an old Claude entry conflicts, inspect/remove it as above, then install again.

For rollback reinstall a previously downloaded, verified tarball and rerun installation. Alpha.3 can read alpha.2 journals, but old uncertain creates have no recoverable stable ID. Do not downgrade after starting an alpha.3 correction: alpha.2 cannot enforce correction links. Finish/reconcile active operations first. Back up the private data directory securely; do not publish it.

## Remove

Run `fitbit-mcp disconnect` to remove local tokens and revoke the Google grant separately in your account. Remove MCP registrations with `codex mcp remove fitbit` and/or `claude mcp remove fitbit --scope user`. Remove only the three installed `fitbit-*` folders from the client skill directory after reviewing local edits, then `npm uninstall --global @detarus/fitbit-mcp`.

Disconnect and uninstall retain the private journal so interrupted writes can be resolved. Deleting that data is a separate manual action after checking the diary; it also deletes local reconciliation history. No automatic data migration or remote grant revocation is promised.

Official skill locations: [Codex](https://learn.chatgpt.com/docs/build-skills), [Claude Code](https://code.claude.com/docs/en/skills).

## Claude Desktop

For ordinary local Desktop chat on macOS/Windows use `fitbit-mcp install --client claude-desktop` (optional `--demo` for synthetic data). See [Desktop instructions](desktop.md); CLI skills and Desktop MCP prompts are different mechanisms. This does not connect web/mobile accounts.

# Local storage

Configuration, OAuth tokens and write journals use per-user local files: macOS Library/Application Support/fitbit-mcp; Windows LOCALAPPDATA/fitbit-mcp; Linux XDG_DATA_HOME/fitbit-mcp (default ~/.local/share/fitbit-mcp). FITBIT_MCP_HOME overrides the directory.

POSIX directories are restricted to 0700 and files to 0600. Windows initialization installs a protected owner-only inheritable ACL; existing files have explicit ACL entries reset to inherit that private directory on first read by a Store instance. Initialization clears that cache. Windows needs PowerShell and icacls on a local filesystem supporting ACLs; failures stop access.

Symlinked/junction data roots, nonregular state files, file symlinks and hardlinked records are rejected. Reads check the opened file identity; POSIX uses O_NOFOLLOW. Writes use exclusive temporary files, flush and atomic rename. Per-record locks serialize cooperating processes. These checks do not isolate malicious processes running as the same OS user or administrators. Parent directories should be trusted.

Storage is not application-encrypted or an OS keychain. Tokens are never returned through MCP tools. Journals contain food and operation data for reconciliation; disconnect removes tokens but retains journals. Keep backups private. See test/storage.test.ts for synthetic permission/link tests on all three operating systems.

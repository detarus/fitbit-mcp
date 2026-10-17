# Ordinary chat clients and connection decision

Research date: 2026-10-17. Product entitlements and administrator policies can change; these are documented options, not completed account tests.

| Client surface | Connection | Current constraints / project status |
| --- | --- | --- |
| Codex / Claude Code | Local stdio and shared skills | Existing installer and synthetic protocol tests |
| Claude Desktop chat, macOS/Windows | Local MCP configuration | New installer; app UI, photos and live Google account still need acceptance |
| Claude web/mobile | Remote custom connector | Free (one custom connector), Pro, Max, Team, Enterprise; organization policies apply. Local Desktop configuration is not shared with these surfaces |
| ChatGPT web | Custom remote MCP / Secure MCP Tunnel | Current official FAQ lists full read/write for Business, Enterprise, Edu; Pro read/fetch. Admin restrictions and write confirmation may apply |
| ChatGPT mobile | Custom MCP unavailable per current FAQ | No local stdio or mobile support claimed |
| ChatGPT desktop | No independently verified local stdio installation path here | Use documented web pathway when eligible |

Photo understanding belongs to the host model. Our MCP accepts explicit dish/portion/macronutrient estimates, preserves their source and requires reviewed writes. Image upload support alone does not establish connector or write access.

## Decision: local Claude Desktop first

Reuse the existing stdio server and Google OAuth in the user's local account. The Desktop application starts the process; the computer must be running. No hosting, public endpoint, inbound remote auth service or extra copy of the journal is introduced. The installer preserves other servers and creates a backup of an existing configuration. Three MCP prompts expose the shared workflows. Claude Code plugins and Desktop chat integrations are separate installation mechanisms.

A desktop extension (.mcpb) could simplify distribution later; this release does not ship one. Claude remote connectors require a reachable endpoint because connections originate from Anthropic's cloud. ChatGPT's official Secure MCP Tunnel is an alternative to public hosting, but does not make our stdio process a ready remote server. Either remote route still requires a supported transport, authenticated access and end-to-end account testing. An independently hosted multi-user service would additionally require token isolation, operations lifecycle and ongoing hosting; it is deferred.

## Primary sources

- [Claude local vs remote surfaces](https://support.claude.com/en/articles/11725091-when-to-use-desktop-and-web-connectors)
- [Claude Desktop local servers and extensions](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop)
- [Claude custom remote connectors, plans and network origin](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)
- [ChatGPT custom MCP, plans, mobile and Secure MCP Tunnel FAQ](https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt)

Desktop setup: [desktop.md](desktop.md). Full photo-to-diary acceptance remains CHAT-04.

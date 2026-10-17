import { it, expect } from "vitest";
import { readFile } from "node:fs/promises";
it("packages plugin manifests and shares the server and skill directory", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  for (const path of [".claude-plugin", ".codex-plugin", ".mcp.json"]) expect(pkg.files).toContain(path);
  const codex = JSON.parse(await readFile(".codex-plugin/plugin.json", "utf8"));
  const claude = JSON.parse(await readFile(".claude-plugin/plugin.json", "utf8"));
  const mcp = JSON.parse(await readFile(".mcp.json", "utf8"));
  expect(codex.name).toBe(claude.name);
  expect(codex.version).toBe(pkg.version);
  expect(claude.version).toBe(pkg.version);
  expect(codex.skills).toBe("./skills/");
  expect(mcp.mcpServers.fitbit.command).toBe("fitbit-mcp");
});

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
for (const client of ["codex", "claude", "codex", "claude"]) {
  const output = execFileSync(process.execPath, [resolve("dist/cli.js"), "install", "--client", client], { encoding: "utf8", timeout: 90000, windowsHide: true });
  const result = JSON.parse(output);
  if (!result.mcpRegistered || result.skills.length !== 3) throw new Error("Incomplete client installation");
  console.log(JSON.stringify({ client, installed: true, skills: 3 }));
}

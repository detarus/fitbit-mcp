import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, copyFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";

const root = resolve(".");
const nodeDirectory = dirname(process.execPath);
const npmCli = [
  join(nodeDirectory, "node_modules/npm/bin/npm-cli.js"),
  join(nodeDirectory, "../lib/node_modules/npm/bin/npm-cli.js"),
].find(existsSync);
assert(npmCli, "Cannot locate the npm CLI bundled with Node.js");
const temporary = await mkdtemp(join(tmpdir(), "fitbit-package-"));
const npm = (args, cwd) => execFileSync(process.execPath, [npmCli, ...args], { cwd, encoding: "utf8", timeout: 180000, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
try {
  const [packed] = JSON.parse(npm(["pack", "--json", "--pack-destination", temporary], root));
  const allowed = new Set(["dist", "skills", ".claude-plugin", ".codex-plugin", ".mcp.json", "docs", "README.md", "LICENSE", "SECURITY.md", "package.json"]);
  for (const file of packed.files) {
    assert(allowed.has(file.path.split("/")[0]), "Unexpected packaged path: " + file.path);
    assert(!/(^|\/)(\.env|tokens[^/]*\.json|client_secret[^/]*\.json)/i.test(file.path), "Sensitive filename in package");
  }
  const consumer = join(temporary, "consumer");
  npm(["install", "--prefix", consumer, "--ignore-scripts", "--no-audit", "--no-fund", join(temporary, packed.filename)], temporary);
  const installed = join(consumer, "node_modules", "@detarus", "fitbit-mcp");
  for (const file of [".claude-plugin/plugin.json", ".codex-plugin/plugin.json", ".mcp.json", "skills/review/SKILL.md", "LICENSE"]) assert(existsSync(join(installed, file)), "Missing installed file: " + file);
  const binary = join(installed, "dist", "cli.js");
  assert(execFileSync(process.execPath, [binary, "--help"], { encoding: "utf8" }).includes("fitbit-mcp:"));
  const result = JSON.parse(execFileSync(process.execPath, [binary, "demo-check"], { encoding: "utf8", timeout: 30000 }));
  assert(result.demo && result.googleRequests === 0);
  assert(result.saved.items.every(item => item.state === "verified"));
  assert(result.removed.items.every(item => item.state === "deleted"));
  await copyFile(join(temporary, packed.filename), join(root, packed.filename));
  console.log(JSON.stringify({ package: packed.filename, installedOutsideRepository: true, demoRoundtrip: "passed", googleRequests: 0 }));
} finally { await rm(temporary, { recursive: true, force: true }); }

import { access, lstat, mkdir, readFile, writeFile, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash, randomUUID } from "node:crypto";
import { AppError } from "./errors.js";
import { version } from "./version.js";

export type ClientName = "codex" | "claude";
const root = fileURLToPath(new URL("../", import.meta.url));
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
async function exists(path: string) { try { await lstat(path); return true; } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return false; throw e; } }
async function atomic(path: string, text: string) {
  const temporary = path + "." + randomUUID() + ".tmp";
  try { await writeFile(temporary, text, { flag: "wx", mode: 0o600 }); await rename(temporary, path); }
  finally { await rm(temporary, { force: true }); }
}
export async function installSkills(client: ClientName, userDirectory = homedir()) {
  const base = join(userDirectory, client === "codex" ? ".agents" : ".claude", "skills");
  const plans = [];
  for (const name of ["setup", "review", "nutrition"]) {
    const target = join(base, "fitbit-" + name);
    const text = (await readFile(join(root, "skills", name, "SKILL.md"), "utf8")).replaceAll("\r\n", "\n").replace("name: " + name + "\n", "name: fitbit-" + name + "\n");
    if (await exists(target)) {
      if ((await lstat(target)).isSymbolicLink()) throw new AppError("INSTALL_CONFLICT", "Skill destination is a symbolic link: " + target);
      try {
        for (const file of ["SKILL.md", ".fitbit-mcp-owned.json"]) if ((await lstat(join(target, file))).isSymbolicLink()) throw new Error("symlink");
        const marker = JSON.parse(await readFile(join(target, ".fitbit-mcp-owned.json"), "utf8"));
        if (marker.project !== "detarus/fitbit-mcp" || marker.hash !== hash(await readFile(join(target, "SKILL.md"), "utf8"))) throw new Error("modified");
      } catch { throw new AppError("INSTALL_CONFLICT", "Existing skill is unowned or edited. Back it up and move it before installing: " + target); }
    }
    plans.push({ target, text });
  }
  for (const plan of plans) {
    await mkdir(plan.target, { recursive: true, mode: 0o700 });
    await atomic(join(plan.target, "SKILL.md"), plan.text);
    await atomic(join(plan.target, ".fitbit-mcp-owned.json"), JSON.stringify({ project: "detarus/fitbit-mcp", version, hash: hash(plan.text) }) + "\n");
  }
  return plans.map(p => p.target);
}
export async function registerMcp(client: ClientName) {
  const script = join(root, "dist", "cli.js");
  const args = client === "codex" ? ["mcp", "add", "fitbit", "--", process.execPath, script, "serve"] : ["mcp", "add", "--scope", "user", "--transport", "stdio", "fitbit", "--", process.execPath, script, "serve"];
  let command: string = client, prefix: string[] = [];
  if (process.platform === "win32") {
    // npm .cmd launchers cannot be passed to execFile; invoke the package's JS entry with Node.
    let found = false;
    for (const directory of (process.env.PATH || "").split(delimiter)) {
      if (!directory) continue;
      const exe = join(directory, client + ".exe");
      try { await access(exe); command = exe; found = true; break; } catch {}
      const entry = join(directory, "node_modules", ...(client === "codex" ? ["@openai", "codex", "bin", "codex.js"] : ["@anthropic-ai", "claude-code", "cli.js"]));
      try { await access(entry); command = process.execPath; prefix = [entry]; found = true; break; } catch {}
    }
    if (!found) throw new AppError("CLIENT_MISSING", "Install the official client CLI first. A Windows native executable or standard global npm installation is required.");
  }
  try { await promisify(execFile)(command, [...prefix, ...args], { windowsHide: true, timeout: 30000 }); }
  catch {
    if (client === "claude") {
      try {
        const existing = await promisify(execFile)(command, [...prefix, "mcp", "get", "fitbit"], { windowsHide: true, timeout: 30000 });
        if (existing.stdout.includes(script) && existing.stdout.includes(process.execPath)) return;
      } catch {}
    }
    throw new AppError("CLIENT_INSTALL", "Cannot register MCP. Check that the selected client CLI is installed, then retry. Use --skills-only if MCP is already registered."); }
}

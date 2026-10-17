import { mkdir, writeFile, rename, chmod, rm, lstat, readdir, open } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import lockfile from "proper-lockfile";
import { AppError } from "./errors.js";

export function defaultDirectory() {
  if (process.env.FITBIT_MCP_HOME) return process.env.FITBIT_MCP_HOME;
  if (process.platform === "darwin") return join(homedir(), "Library", "Application Support", "fitbit-mcp");
  if (process.platform === "win32") return join(process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"), "fitbit-mcp");
  return join(process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"), "fitbit-mcp");
}
export class Store {
  private hardened = new Set<string>();
  constructor(public directory = defaultDirectory()) {}
  async init() {
    this.hardened.clear();
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    if ((await lstat(this.directory)).isSymbolicLink()) throw new AppError("STORAGE", "Data directory must not be a symlink.");
    if (process.platform === "win32") {
      try {
        const script = [
          "$ErrorActionPreference='Stop'",
          "$sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User",
          "$acl=[System.Security.AccessControl.DirectorySecurity]::new()",
          "$acl.SetOwner($sid)",
          "$acl.SetAccessRuleProtection($true,$false)",
          "$rule=[System.Security.AccessControl.FileSystemAccessRule]::new($sid,[System.Security.AccessControl.FileSystemRights]::FullControl,[System.Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit',[System.Security.AccessControl.PropagationFlags]::None,[System.Security.AccessControl.AccessControlType]::Allow)",
          "$acl.AddAccessRule($rule)",
          "Set-Acl -LiteralPath $env:FITBIT_MCP_ACL_PATH -AclObject $acl",
        ].join("; ");
        await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true, env: { ...process.env, FITBIT_MCP_ACL_PATH: this.directory } });
      } catch (cause) {
        const error = new AppError("STORAGE", "Cannot restrict Windows data-directory ACL. Choose a private local directory.");
        error.cause = cause; // Retained for local test diagnostics; publicError never exposes causes.
        throw error;
      }
    } else await chmod(this.directory, 0o700);
  }
  path(name: string) {
    if (!/^[a-zA-Z0-9.-]+$/.test(name) || name === "." || name === "..") throw new AppError("STORAGE", "Invalid local record name.");
    return join(this.directory, name);
  }
  async regular(name: string) {
    const path = this.path(name);
    try {
      const stat = await lstat(path);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new AppError("STORAGE", "State must be a regular, unlinked private file.");
      return stat;
    } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
  }
  async read<T>(name: string): Promise<T | undefined> {
    const path = this.path(name);
    try {
      const before = await this.regular(name);
      if (!before) return undefined;
      if (process.platform === "win32" && !this.hardened.has(path)) {
        await promisify(execFile)("icacls", [path, "/reset"], { windowsHide: true });
        this.hardened.add(path);
      }
      const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
      try {
        const current = await file.stat();
        if (!current.isFile() || current.nlink !== 1 || current.ino !== before.ino || current.dev !== before.dev) throw new Error("State changed during open");
        if (process.platform !== "win32") await file.chmod(0o600);
        return JSON.parse(await file.readFile("utf8")) as T;
      } finally { await file.close(); }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw new AppError("STORAGE", "Cannot read private local state. Check file type, permissions and backups.");
    }
  }
  async write(name: string, value: unknown) {
    await this.regular(name);
    const target = this.path(name), temp = this.path(name + "." + randomUUID() + ".tmp");
    try {
      await writeFile(temp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600, flag: "wx", flush: true });
      await rename(temp, target);
    } finally { await rm(temp, { force: true }); }
  }
  async operationFiles(demo: boolean) {
    const prefix = demo ? "demo-" : "live-";
    return (await readdir(this.directory)).filter(name => name.startsWith(prefix) && /^(demo|live)-[a-fA-F0-9-]{36}\.json$/.test(name)).sort();
  }
  async remove(name: string) { await rm(this.path(name), { force: true }); }
  async locked<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const release = await lockfile.lock(this.path(name), {
      realpath: false, stale: 120000, update: 5000,
      retries: { retries: 30, minTimeout: 100, maxTimeout: 500 },
    }).catch(() => { throw new AppError("BUSY", "Another process is using this record. Retry later; do not remove active locks."); });
    try { return await fn(); } finally { await release(); }
  }
}

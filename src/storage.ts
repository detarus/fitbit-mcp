import { mkdir, readFile, writeFile, rename, chmod, rm, lstat, readdir } from "node:fs/promises";
import { homedir, userInfo } from "node:os";
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
  constructor(public directory = defaultDirectory()) {}
  async init() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    if ((await lstat(this.directory)).isSymbolicLink()) throw new AppError("STORAGE", "Data directory must not be a symlink.");
    if (process.platform === "win32") {
      const account = process.env.USERDOMAIN ? process.env.USERDOMAIN + "\\" + userInfo().username : userInfo().username;
      try {
        await promisify(execFile)("icacls", [this.directory, "/inheritance:r", "/grant:r", account + ":(OI)(CI)F"], { windowsHide: true });
      } catch { throw new AppError("STORAGE", "Cannot restrict Windows data-directory ACL. Choose a private local directory."); }
    } else await chmod(this.directory, 0o700);
  }
  path(name: string) {
    if (!/^[a-zA-Z0-9.-]+$/.test(name) || name === "." || name === "..") throw new AppError("STORAGE", "Invalid local record name.");
    return join(this.directory, name);
  }
  async read<T>(name: string): Promise<T | undefined> {
    try { return JSON.parse(await readFile(this.path(name), "utf8")) as T; }
    catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw new AppError("STORAGE", "Cannot read local state. Check permissions and backups.");
    }
  }
  async write(name: string, value: unknown) {
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

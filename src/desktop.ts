import { readFile, writeFile, rename, rm, mkdir, lstat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import lockfile from "proper-lockfile";
import { AppError } from "./errors.js";

export function desktopConfigPath(platform: string = process.platform, home = homedir(), appData = process.env.APPDATA) {
  if (platform === "darwin") return join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
  if (platform === "win32") return join(appData || join(home, "AppData", "Roaming"), "Claude", "claude_desktop_config.json");
  throw new AppError("CLIENT_PLATFORM", "Claude Desktop configuration is supported on macOS and Windows.");
}
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === "object" && !Array.isArray(value);
export async function installDesktop(path = desktopConfigPath(), demo = false) {
  await mkdir(dirname(path), { recursive: true });
  const release = await lockfile.lock(path, { realpath: false, retries: 5 }).catch(() => { throw new AppError("BUSY", "Desktop configuration is being edited. Quit Claude Desktop and retry."); });
  try {
    let original: string | undefined;
    try {
      const info = await lstat(path);
      if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw new AppError("INSTALL_CONFLICT", "Desktop configuration must be a regular file.");
      original = await readFile(path, "utf8");
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    let config: Record<string, any>;
    try {
      config = original === undefined ? {} : JSON.parse(original);
      if (!object(config) || config.mcpServers !== undefined && !object(config.mcpServers)) throw new Error("shape");
    } catch { throw new AppError("INSTALL_CONFIG", "Desktop configuration contains invalid JSON/shape. Repair it before installing; it was not changed."); }
    const script = fileURLToPath(new URL("./cli.js", import.meta.url));
    const entry = { command: process.execPath, args: [script, "serve", ...(demo ? ["--demo"] : [])] };
    const previous = config.mcpServers?.fitbit;
    if (previous !== undefined && JSON.stringify(previous) !== JSON.stringify(entry)) throw new AppError("INSTALL_CONFLICT", "An existing fitbit Desktop entry differs. Review it and remove only that entry before changing the installation or mode.");
    if (previous !== undefined) return { installed: "claude-desktop", path, changed: false, demo };
    config.mcpServers = { ...config.mcpServers, fitbit: entry };
    const backup = original === undefined ? undefined : path + ".fitbit-backup-" + randomUUID();
    if (backup) await writeFile(backup, original!, { flag: "wx", mode: 0o600 });
    const temporary = path + "." + randomUUID() + ".tmp";
    try {
      await writeFile(temporary, JSON.stringify(config, null, 2) + "\n", { flag: "wx", mode: 0o600 });
      // Detect editors that do not honor our lock before replacing their file.
      const current = await readFile(path, "utf8").catch((e: NodeJS.ErrnoException) => { if (e.code === "ENOENT") return undefined; throw e; });
      if (current !== original) throw new AppError("INSTALL_CONFLICT", "Desktop configuration changed during installation. Retry after closing the app.");
      await rename(temporary, path);
    } finally { await rm(temporary, { force: true }); }
    return { installed: "claude-desktop", path, backup, changed: true, demo, note: "Restart Claude Desktop and inspect the fitbit tools. Local configuration does not connect web/mobile accounts." };
  } finally { await release(); }
}

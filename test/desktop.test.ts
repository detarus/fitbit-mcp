import { it, expect } from "vitest";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { desktopConfigPath, installDesktop } from "../src/desktop.js";
it("merges Desktop config, keeps unrelated settings, backs up and repeats without changes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "fitbit-desktop-")), path = join(dir, "config.json");
  try {
    const before = JSON.stringify({ preferences: { language: "ru" }, mcpServers: { other: { command: "other" } } });
    await writeFile(path, before);
    const first = await installDesktop(path, true), second = await installDesktop(path, true);
    expect(first.changed).toBe(true); expect(second.changed).toBe(false);
    expect(await readFile(first.backup!, "utf8")).toBe(before);
    const config = JSON.parse(await readFile(path, "utf8"));
    expect(config.preferences.language).toBe("ru"); expect(config.mcpServers.other.command).toBe("other");
    expect(config.mcpServers.fitbit.args.at(-1)).toBe("--demo");
    await expect(installDesktop(path, false)).rejects.toMatchObject({ code: "INSTALL_CONFLICT" });
  } finally { await rm(dir, { recursive: true, force: true }); }
});
it("refuses malformed configuration and documents platform paths", async () => {
  const dir = await mkdtemp(join(tmpdir(), "fitbit-desktop-")), path = join(dir, "config.json");
  try {
    for (const text of ["invalid", "[]", '{"mcpServers":[]}']) {
      await writeFile(path, text);
      await expect(installDesktop(path)).rejects.toMatchObject({ code: "INSTALL_CONFIG" });
      expect(await readFile(path, "utf8")).toBe(text);
    }
    expect(desktopConfigPath("darwin", dir)).toContain("Application Support");
    expect(desktopConfigPath("win32", dir, join(dir, "roaming"))).toBe(join(dir, "roaming", "Claude", "claude_desktop_config.json"));
    expect(() => desktopConfigPath("linux", dir)).toThrow();
  } finally { await rm(dir, { recursive: true, force: true }); }
});

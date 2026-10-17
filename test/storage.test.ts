import { it, expect } from "vitest";
import { mkdtemp, rm, readFile, writeFile, link, symlink, chmod, stat, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { Store } from "../src/storage.js";
async function sandbox(fn: (directory: string, store: Store) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), "fitbit-storage-"));
  try { const store = new Store(join(directory, "state")); await store.init(); await fn(directory, store); }
  finally { await rm(directory, { recursive: true, force: true }); }
}
it("rejects traversal, directories and hardlinked state without changing the target", async () => {
  await sandbox(async (dir, store) => {
    expect(() => store.path("../tokens.json")).toThrow();
    await mkdir(store.path("config.json"));
    await expect(store.read("config.json")).rejects.toMatchObject({ code: "STORAGE" });
    const original = join(dir, "original.json"); await writeFile(original, '{"secret":"synthetic"}');
    await link(original, store.path("tokens.json"));
    await expect(store.read("tokens.json")).rejects.toMatchObject({ code: "STORAGE" });
    await expect(store.write("tokens.json", {})).rejects.toMatchObject({ code: "STORAGE" });
    expect(await readFile(original, "utf8")).toBe('{"secret":"synthetic"}');
  });
});
it("rejects symlinked state on POSIX and data-directory junctions/symlinks", async () => {
  await sandbox(async (dir, store) => {
    const alias = join(dir, "alias"); await symlink(store.directory, alias, process.platform === "win32" ? "junction" : "dir");
    await expect(new Store(alias).init()).rejects.toMatchObject({ code: "STORAGE" });
    if (process.platform !== "win32") {
      const target = join(dir, "target.json"); await writeFile(target, "{}");
      await symlink(target, store.path("tokens.json"));
      await expect(store.read("tokens.json")).rejects.toMatchObject({ code: "STORAGE" });
      await expect(store.write("tokens.json", {})).rejects.toMatchObject({ code: "STORAGE" });
    }
  });
});
it("repairs POSIX permissions and removes explicit Windows Everyone grants", async () => {
  await sandbox(async (_dir, store) => {
    await store.write("tokens.json", { synthetic: true });
    if (process.platform === "win32") {
      execFileSync("icacls", [store.directory, "/grant", "*S-1-1-0:(OI)(CI)R"]);
      execFileSync("icacls", [store.path("tokens.json"), "/grant", "*S-1-1-0:R"]);
      await store.init(); await store.read("tokens.json");
      const command = "$a=[System.IO.File]::GetAccessControl($env:FITBIT_TEST_ACL_PATH).Access; @($a | Where-Object { $_.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value -eq 'S-1-1-0' }).Count";
      const count = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], { encoding: "utf8", env: { ...process.env, FITBIT_TEST_ACL_PATH: store.path("tokens.json") } }).trim();
      expect(count).toBe("0");
    } else {
      await chmod(store.directory, 0o755); await chmod(store.path("tokens.json"), 0o644);
      await store.init(); await store.read("tokens.json");
      expect((await stat(store.directory)).mode & 0o777).toBe(0o700);
      expect((await stat(store.path("tokens.json"))).mode & 0o777).toBe(0o600);
    }
    expect(await store.read("tokens.json")).toEqual({ synthetic: true });
  });
});

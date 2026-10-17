import { it, expect } from "vitest";
import { mkdtemp, readFile, writeFile, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { installSkills } from "../src/install.js";
it("installs both clients' namespaced skills, repeats upgrades, and preserves edited/unowned files", async () => {
  const home = await mkdtemp(join(tmpdir(), "fitbit-install-"));
  try {
    for (const client of ["codex", "claude"] as const) {
      const paths = await installSkills(client, home);
      expect(paths).toHaveLength(3);
      expect(await readFile(join(paths[0], "SKILL.md"), "utf8")).toContain("name: fitbit-setup");
      expect(await installSkills(client, home)).toEqual(paths);
      await writeFile(join(paths[1], "SKILL.md"), "personal content");
      await expect(installSkills(client, home)).rejects.toMatchObject({ code: "INSTALL_CONFLICT" });
      expect(await readFile(join(paths[1], "SKILL.md"), "utf8")).toBe("personal content");
    }
    const other = join(home, "other");
    const target = join(other, ".agents", "skills", "fitbit-setup");
    await mkdir(target, { recursive: true }); await writeFile(join(target, "SKILL.md"), "unowned");
    await expect(installSkills("codex", other)).rejects.toMatchObject({ code: "INSTALL_CONFLICT" });
    expect(await readFile(join(target, "SKILL.md"), "utf8")).toBe("unowned");
  } finally { await rm(home, { recursive: true, force: true }); }
});

import { execFileSync } from "node:child_process";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import assert from "node:assert/strict";

const pkg = JSON.parse(await readFile("package.json", "utf8"));
assert(/^\d+\.\d+\.\d+-alpha\.\d+$/.test(pkg.version), "Only alpha prereleases are automated");
const tag = "v" + pkg.version;
const gh = args => execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
let existing;
try { existing = JSON.parse(gh(["release", "view", tag, "--json", "url,isPrerelease"])); } catch {}
if (existing) {
  assert(existing.isPrerelease, "Never mutate an existing stable release");
  console.log("Existing prerelease retained: " + existing.url);
} else {
  const sha = process.env.GITHUB_SHA;
  assert(/^[a-f0-9]{40}$/.test(sha || ""), "Expected the tested commit SHA");
  const assets = "release-assets";
  const expected = "detarus-fitbit-mcp-" + pkg.version + ".tgz";
  const files = await readdir(assets);
  assert(files.length === 1 && files[0] === expected, "Expected one tested Ubuntu package artifact");
  const path = join(assets, expected);
  const digest = createHash("sha256").update(await readFile(path)).digest("hex");
  const checksums = join(assets, "SHA256SUMS");
  await writeFile(checksums, digest + "  " + expected + "\n");
  // Creation happens only in the CI job gated by every OS and client-config check.
  console.log(gh(["release", "create", tag, "--target", sha, "--prerelease", "--title", "fitbit-mcp " + pkg.version, "--notes-file", "docs/releases/" + pkg.version + ".md", path, checksums]));
}

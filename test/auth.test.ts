import { afterEach, beforeEach, it, expect } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/storage.js";
import { Auth } from "../src/auth.js";
let dir: string, store: Store, auth: Auth;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "fitbit-auth-test-"));
  store = new Store(dir); await store.init(); auth = new Auth(store);
});
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });
it("rejects web credentials and stores Desktop credentials without returning them", async () => {
  const path = join(dir, "input.json");
  await writeFile(path, JSON.stringify({ web: { client_id: "test.apps.googleusercontent.com", client_secret: "synthetic-secret" } }));
  await expect(auth.setup(path, false)).rejects.toMatchObject({ code: "CONFIG" });
  await writeFile(path, JSON.stringify({ installed: { client_id: "test.apps.googleusercontent.com", client_secret: "synthetic-secret" } }));
  const result = await auth.setup(path, true);
  expect(JSON.stringify(result)).not.toContain("synthetic-secret");
  expect((await auth.config()).nutritionWrite).toBe(true);
});
it("clears stale authorization on setup and preserves journals on local disconnect", async () => {
  const path = join(dir, "input.json");
  await writeFile(path, JSON.stringify({ installed: { client_id: "test.apps.googleusercontent.com", client_secret: "synthetic-secret" } }));
  await store.write("tokens.json", { credentials: { refresh_token: "synthetic-refresh" }, scopes: [], accountId: "synthetic-user" });
  await auth.setup(path, false); expect(await auth.record()).toBeUndefined();
  await store.write("tokens.json", { credentials: {}, scopes: [], accountId: "synthetic-user" });
  await store.write("journal.json", { synthetic: true });
  expect((await auth.disconnect()).remoteGrantRevoked).toBe(false);
  expect(await auth.record()).toBeUndefined();
  expect(await store.read("journal.json")).toEqual({ synthetic: true });
});

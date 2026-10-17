import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { OAuth2Client } from "google-auth-library";
import { Auth, type Config } from "../src/auth.js";
import { Store } from "../src/storage.js";
import { publicError } from "../src/errors.js";
import { scopePrefix } from "../src/schema.js";

let dir: string, store: Store;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "fitbit-oauth-flow-")); store = new Store(dir); await store.init();
  const path = join(dir, "input.json");
  await writeFile(path, JSON.stringify({ installed: { client_id: "test.apps.googleusercontent.com", client_secret: "synthetic-client-secret" } }));
  await new Auth(store).setup(path, true);
});
afterEach(async () => { vi.restoreAllMocks(); await rm(dir, { recursive: true, force: true }); });
function client(config: Config, redirect?: string) {
  return new OAuth2Client(config.clientId, config.clientSecret, redirect);
}
const credentials = () => ({ access_token: "synthetic-access", refresh_token: "synthetic-refresh", expiry_date: Date.now() + 3600000 });

it("uses S256 PKCE and state on a real loopback listener, rejects wrong state, and preserves partial consent", async () => {
  let callback: Promise<void> = Promise.resolve();
  const calls: unknown[] = [];
  const auth = new Auth(store, {
    client: (config, redirect) => {
      const c = client(config, redirect);
      vi.spyOn(c, "getToken").mockImplementation(async (input: any) => { calls.push(input); return { tokens: credentials(), res: null } as any; });
      vi.spyOn(c, "getTokenInfo").mockResolvedValue({ scopes: [scopePrefix + "sleep.readonly"], expiry_date: Date.now() + 3600000 } as any);
      return c;
    },
    fetch: vi.fn(async () => new Response(JSON.stringify({ healthUserId: "synthetic-user" }), { status: 200 })),
    onAuthorize: url => {
      callback = (async () => {
        const u = new URL(url);
        expect(u.searchParams.get("code_challenge_method")).toBe("S256");
        expect(u.searchParams.get("code_challenge")).toBeTruthy();
        const redirect = new URL(u.searchParams.get("redirect_uri")!);
        expect(redirect.hostname).toBe("127.0.0.1");
        redirect.searchParams.set("code", "synthetic-code");
        redirect.searchParams.set("state", "wrong-state");
        expect((await fetch(redirect)).status).toBe(400);
        expect(calls).toHaveLength(0);
        redirect.searchParams.set("state", u.searchParams.get("state")!);
        expect((await fetch(redirect)).status).toBe(200);
      })();
    },
  });
  const result = await auth.login(false);
  await callback;
  expect(result.grantedScopes).toEqual(["sleep.readonly"]);
  expect(calls).toHaveLength(1);
  expect((calls[0] as any).codeVerifier.length).toBeGreaterThanOrEqual(43);
  expect(JSON.stringify(result)).not.toContain("synthetic-access");
  expect((await auth.status()).nutritionWritePermission).toBe(false);
  await expect(auth.requireScope("nutrition.writeonly")).rejects.toMatchObject({ code: "MISSING_SCOPE" });
});
it("cleans up the callback after timeout", async () => {
  let address = "";
  const auth = new Auth(store, { timeoutMs: 100, onAuthorize: url => { address = new URL(url).searchParams.get("redirect_uri")!; } });
  await expect(auth.login(false)).rejects.toMatchObject({ code: "OAUTH_TIMEOUT" });
  await expect(fetch(address)).rejects.toThrow();
  expect(await auth.record()).toBeUndefined();
});
it("serializes refresh across Auth instances and retains a rotated token", async () => {
  await store.write("tokens.json", { credentials: { ...credentials(), expiry_date: 0 }, scopes: [], accountId: "synthetic-user" });
  let refreshes = 0;
  const runtime = {
    client: (config: Config, redirect?: string) => {
      const c = client(config, redirect);
      vi.spyOn(c, "refreshAccessToken").mockImplementation(async () => {
        refreshes++; await new Promise(r => setTimeout(r, 30));
        return { credentials: { ...credentials(), refresh_token: "synthetic-rotated" }, res: null } as any;
      });
      vi.spyOn(c, "getTokenInfo").mockResolvedValue({ scopes: [scopePrefix + "sleep.readonly"] } as any);
      return c;
    },
  };
  const auth = new Auth(store, runtime), other = new Auth(new Store(dir), runtime);
  await Promise.all([auth.accessToken(), other.accessToken()]);
  expect(refreshes).toBe(1);
  expect((await auth.record())?.credentials.refresh_token).toBe("synthetic-rotated");
});
it("persists rotated credentials before a failed info request and recovers without re-refreshing", async () => {
  await store.write("tokens.json", { credentials: { ...credentials(), expiry_date: 0 }, scopes: [], accountId: "synthetic-user" });
  let refreshes = 0, checks = 0;
  const auth = new Auth(store, {
    client: (config, redirect) => {
      const c = client(config, redirect);
      vi.spyOn(c, "refreshAccessToken").mockImplementation(async () => { refreshes++; return { credentials: { ...credentials(), refresh_token: "synthetic-rotated" }, res: null } as any; });
      vi.spyOn(c, "getTokenInfo").mockImplementation(async () => {
        if (++checks === 1) throw new Error("synthetic-private-body");
        return { scopes: [scopePrefix + "sleep.readonly"] } as any;
      });
      return c;
    },
  });
  await expect(auth.accessToken()).rejects.toMatchObject({ code: "AUTH_NETWORK" });
  expect((await auth.record())?.credentials.refresh_token).toBe("synthetic-rotated");
  expect((await auth.status()).tokenState).toBe("scope-check-needed");
  expect(await auth.accessToken()).toBe("synthetic-access");
  expect(refreshes).toBe(1); expect(checks).toBe(2);
});
it("clears a revoked grant and redacts upstream error bodies", async () => {
  await store.write("tokens.json", { credentials: { ...credentials(), expiry_date: 0 }, scopes: [], accountId: "synthetic-user" });
  const auth = new Auth(store, {
    client: (config, redirect) => {
      const c = client(config, redirect);
      vi.spyOn(c, "refreshAccessToken").mockRejectedValue({ response: { data: { error: "invalid_grant", private: "synthetic-private-body" } } });
      return c;
    },
  });
  let error: unknown; try { await auth.accessToken(); } catch (e) { error = e; }
  expect(publicError(error).code).toBe("AUTH_EXPIRED");
  expect(JSON.stringify(publicError(error))).not.toContain("synthetic-private-body");
  expect(await auth.record()).toBeUndefined();
});

it("refreshes once across two independent Node processes", async () => {
  await store.write("tokens.json", { credentials: { ...credentials(), expiry_date: 0 }, scopes: [], accountId: "synthetic-user" });
  const execute = promisify(execFile);
  const args = [resolve("test/fixtures/refresh-worker.mjs"), dir];
  const results = await Promise.all([
    execute(process.execPath, args, { timeout: 15000 }),
    execute(process.execPath, args, { timeout: 15000 }),
  ]);
  expect(results.map(r => JSON.parse(r.stdout))).toEqual([{ refreshedOrReused: true }, { refreshedOrReused: true }]);
  expect((await readFile(join(dir, "refresh-calls.log"), "utf8")).trim().split("\n")).toEqual(["refresh"]);
  expect((await authToken(store)).credentials.refresh_token).toBe("synthetic-rotated");
});
async function authToken(store: Store) { return (await store.read<any>("tokens.json"))!; }

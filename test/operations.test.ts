import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Store } from "../src/storage.js";
import { DemoHealth } from "../src/api.js";
import { Operations } from "../src/operations.js";
import { AppError } from "../src/errors.js";

let dir: string, store: Store, api: DemoHealth, ops: Operations;
function meal(requestId = randomUUID()) { return { requestId, at: "2026-10-17T13:00:00+03:00", mealType: "LUNCH", dishes: [{ name: "Chicken", grams: 100, kcal: 165, protein: 31, fat: 3.6, carbs: 0, source: "label" }] }; }
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "fitbit-test-"));
  store = new Store(dir); await store.init(); api = new DemoHealth(); ops = new Operations(store, api, async () => true);
});
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });
describe("durable meal operations", () => {
  it("does not write while previewing and verifies save/read/delete", async () => {
    const create = vi.spyOn(api, "create"), input = meal();
    await ops.preview("meal", input); expect(create).not.toHaveBeenCalled();
    const saved = await ops.commit(input.requestId, true);
    expect(saved.items[0].state).toBe("verified");
    expect((await ops.remove(input.requestId, true)).items[0].state).toBe("deleted");
    await expect(ops.commit(input.requestId, true)).rejects.toMatchObject({ code: "CANCELLED" });
  });
  it("serializes concurrent clients and survives an Operations instance restart", async () => {
    const create = vi.spyOn(api, "create"), input = meal(); await ops.preview("meal", input);
    const other = new Operations(new Store(dir), api, async () => true);
    const results = await Promise.all([ops.commit(input.requestId, true), other.commit(input.requestId, true)]);
    expect(results.every(r => r.items[0].state === "verified")).toBe(true); expect(create).toHaveBeenCalledTimes(1);
    await other.commit(input.requestId, true); expect(create).toHaveBeenCalledTimes(1);
  });
  it("never retries ambiguous creates and stops remaining dishes", async () => {
    const create = vi.spyOn(api, "create").mockRejectedValue(new AppError("WRITE_UNCERTAIN", "timeout"));
    const input = meal(); input.dishes.push({ ...input.dishes[0], name: "Rice" }); await ops.preview("meal", input);
    const saved = await ops.commit(input.requestId, true);
    expect(saved.items.map(i => i.state)).toEqual(["unknown", "pending"]);
    await ops.commit(input.requestId, true); expect(create).toHaveBeenCalledTimes(1);
  });
  it("recovers known created records by read-back without re-posting", async () => {
    const input = meal(); await ops.preview("meal", input);
    const get = vi.spyOn(api, "get").mockRejectedValueOnce(new AppError("NETWORK", "offline"));
    expect((await ops.commit(input.requestId, true)).items[0].state).toBe("created");
    const create = vi.spyOn(api, "create");
    expect((await ops.commit(input.requestId, true)).items[0].state).toBe("verified");
    expect(create).not.toHaveBeenCalled(); get.mockRestore();
  });
  it("blocks a crash-persisted sending state", async () => {
    const input = meal(); await ops.preview("meal", input);
    const op: any = await store.read(ops.file(input.requestId)); op.items[0].state = "sending"; await store.write(ops.file(input.requestId), op);
    const create = vi.spyOn(api, "create"); await ops.commit(input.requestId, true); expect(create).not.toHaveBeenCalled();
  });
  it("checks permissions, explicit intent, immutable request content and account binding", async () => {
    const input = meal(); await ops.preview("meal", input);
    await expect(ops.commit(input.requestId, false)).rejects.toMatchObject({ code: "CONFIRM_REQUIRED" });
    await expect(new Operations(store, api, async () => false).commit(input.requestId, true)).rejects.toMatchObject({ code: "WRITE_DISABLED" });
    await expect(ops.preview("meal", { ...input, mealType: "DINNER" })).rejects.toMatchObject({ code: "REQUEST_ID_CONFLICT" });
    vi.spyOn(api, "accountKey").mockResolvedValue("other-account");
    await expect(ops.commit(input.requestId, true)).rejects.toMatchObject({ code: "ACCOUNT_MISMATCH" });
  });
  it("keeps credentials out of file names and restricts POSIX state files", async () => {
    const input = meal(); await ops.preview("meal", input);
    if (process.platform !== "win32") {
      expect((await stat(store.path(ops.file(input.requestId)))).mode & 0o777).toBe(0o600);
      expect((await stat(dir)).mode & 0o777).toBe(0o700);
    }
  });
  it("holds the session lock across account-bound writes", async () => {
    const input = meal(); await ops.preview("meal", input);
    const order: string[] = [];
    const create = api.create.bind(api);
    vi.spyOn(api, "create").mockImplementation(async (type, body) => {
      order.push("create");
      await new Promise(r => setTimeout(r, 30));
      return create(type, body);
    });
    const saving = ops.commit(input.requestId, true);
    await new Promise(r => setTimeout(r, 10));
    const switching = store.locked("session", async () => { order.push("switch-account"); });
    await Promise.all([saving, switching]);
    expect(order).toEqual(["create", "switch-account"]);
  });
  it("logs and removes water through the same journal", async () => {
    const requestId = randomUUID(); await ops.preview("water", { requestId, at: "2026-10-17T13:00:00Z", milliliters: 250 });
    expect((await ops.commit(requestId, true)).items[0].state).toBe("verified");
    expect((await ops.remove(requestId, true)).items[0].state).toBe("deleted");
  });
});

describe("recovery and corrections", () => {
  it("recovers an accepted create with a lost response by stable ID after restart, without another POST", async () => {
    const input = meal(); await ops.preview("meal", input);
    const original = api.create.bind(api);
    const create = vi.spyOn(api, "create").mockImplementationOnce(async (kind, body) => { await original(kind, body); throw new AppError("WRITE_UNCERTAIN", "response lost"); });
    expect((await ops.commit(input.requestId, true)).items[0].state).toBe("unknown");
    const restarted = new Operations(new Store(dir), api, async () => true);
    expect((await restarted.reconcile(input.requestId)).items[0].state).toBe("verified");
    await restarted.commit(input.requestId, true); expect(create).toHaveBeenCalledTimes(1);
    expect((await restarted.list()).operations[0].operationId).toBe(input.requestId);
  });
  it("keeps 404 creates and legacy crashes uncertain; never guesses identity from matching food", async () => {
    const input = meal(); await ops.preview("meal", input);
    vi.spyOn(api, "create").mockRejectedValueOnce(new AppError("WRITE_UNCERTAIN", "offline"));
    await ops.commit(input.requestId, true);
    expect((await ops.reconcile(input.requestId)).items[0].state).toBe("unknown");
    const op: any = await store.read(ops.file(input.requestId)); delete op.items[0].expectedName; op.items[0].state = "sending"; await store.write(ops.file(input.requestId), op);
    const get = vi.spyOn(api, "get");
    expect((await ops.reconcile(input.requestId)).items[0].state).toBe("sending"); expect(get).not.toHaveBeenCalled();
  });
  it("will not attach an ID whose payload changed externally", async () => {
    const input = meal(); await ops.preview("meal", input); await ops.commit(input.requestId, true);
    const op: any = await store.read(ops.file(input.requestId)); op.items[0].state = "unknown"; await store.write(ops.file(input.requestId), op);
    const get = api.get.bind(api);
    vi.spyOn(api, "get").mockImplementation(async name => ({ ...await get(name), nutritionLog: { ...(await get(name)).nutritionLog, energy: { kcal: 999 } } }));
    expect((await ops.reconcile(input.requestId)).items[0]).toMatchObject({ state: "unknown", error: { code: "VERIFY" } });
  });
  it("recovers a completed delete with a lost response without deleting twice", async () => {
    const input = meal(); await ops.preview("meal", input); await ops.commit(input.requestId, true);
    const original = api.remove.bind(api);
    const remove = vi.spyOn(api, "remove").mockImplementationOnce(async (kind, name) => { await original(kind, name); throw new Error("lost"); });
    await expect(ops.remove(input.requestId, true)).rejects.toMatchObject({ code: "DELETE_UNCERTAIN" });
    expect((await ops.reconcile(input.requestId)).items[0].state).toBe("deleted");
    await ops.remove(input.requestId, true); expect(remove).toHaveBeenCalledTimes(1);
  });
  it("allows an explicit delete retry after read-back proves the record is still present", async () => {
    const input = meal(); await ops.preview("meal", input); await ops.commit(input.requestId, true);
    vi.spyOn(api, "remove").mockRejectedValueOnce(new Error("not sent"));
    await expect(ops.remove(input.requestId, true)).rejects.toMatchObject({ code: "DELETE_UNCERTAIN" });
    expect((await ops.reconcile(input.requestId)).items[0].state).toBe("verified");
    expect((await ops.remove(input.requestId, true)).items[0].state).toBe("deleted");
  });
  it("previews correction without writes, resumes a partial replacement and excludes a competing correction", async () => {
    const old = meal(); await ops.preview("meal", old); await ops.commit(old.requestId, true);
    const replacement = meal(); replacement.dishes[0].kcal = 180;
    const competing = meal();
    const original = api.create.bind(api);
    const create = vi.spyOn(api, "create"), remove = vi.spyOn(api, "remove");
    await ops.preview("meal", replacement, old.requestId); await ops.preview("meal", competing, old.requestId);
    expect(create).not.toHaveBeenCalled(); expect(remove).not.toHaveBeenCalled();
    create.mockImplementationOnce(async (kind, body) => { await original(kind, body); throw new Error("lost"); });
    expect((await ops.commit(replacement.requestId, true)).items[0].state).toBe("unknown");
    expect((await ops.status(old.requestId)).items[0].state).toBe("deleted");
    await expect(ops.commit(competing.requestId, true)).rejects.toMatchObject({ code: "CORRECTION_BLOCKED" });
    await ops.reconcile(replacement.requestId);
    expect((await ops.commit(replacement.requestId, true)).items[0].state).toBe("verified");
    expect(create).toHaveBeenCalledTimes(1); expect(remove).toHaveBeenCalledTimes(1);
  });
  it("blocks new writes when original deletion is uncertain, then resumes the same correction", async () => {
    const old = meal(); await ops.preview("meal", old); await ops.commit(old.requestId, true);
    const replacement = meal(); await ops.preview("meal", replacement, old.requestId);
    vi.spyOn(api, "remove").mockRejectedValueOnce(new Error("offline"));
    const create = vi.spyOn(api, "create");
    await expect(ops.commit(replacement.requestId, true)).rejects.toMatchObject({ code: "DELETE_UNCERTAIN" });
    expect(create).not.toHaveBeenCalled();
    await expect(ops.cancel(replacement.requestId)).rejects.toMatchObject({ code: "CORRECTION_STARTED" });
    await ops.reconcile(old.requestId);
    expect((await ops.commit(replacement.requestId, true)).items[0].state).toBe("verified");
  });
  it("keeps list mode/account isolation and checks permission inside the session lock", async () => {
    const input = meal(); await ops.preview("meal", input);
    vi.spyOn(api, "accountKey").mockResolvedValue("different");
    expect((await ops.list()).operations).toEqual([]);
    await expect(ops.reconcile(input.requestId)).rejects.toMatchObject({ code: "ACCOUNT_MISMATCH" });
  });
});

it("expires untouched drafts but resumes a started multi-dish operation after a long interruption", async () => {
  const expired = meal(); await ops.preview("meal", expired);
  const draft: any = await store.read(ops.file(expired.requestId)); draft.createdAt = "2020-01-01T00:00:00Z"; await store.write(ops.file(expired.requestId), draft);
  await expect(ops.commit(expired.requestId, true)).rejects.toMatchObject({ code: "PREVIEW_EXPIRED" });
  const input = meal(); input.dishes.push({ ...input.dishes[0], name: "Rice" }); await ops.preview("meal", input);
  const original = api.create.bind(api);
  const create = vi.spyOn(api, "create").mockImplementationOnce(async (kind, body) => { await original(kind, body); throw new Error("lost"); });
  await ops.commit(input.requestId, true);
  const interrupted: any = await store.read(ops.file(input.requestId)); interrupted.createdAt = "2020-01-01T00:00:00Z"; await store.write(ops.file(input.requestId), interrupted);
  await ops.reconcile(input.requestId);
  expect((await ops.commit(input.requestId, true)).items.every(i => i.state === "verified")).toBe(true);
  expect(create).toHaveBeenCalledTimes(2);
});

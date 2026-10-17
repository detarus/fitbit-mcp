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
  it("logs and removes water through the same journal", async () => {
    const requestId = randomUUID(); await ops.preview("water", { requestId, at: "2026-10-17T13:00:00Z", milliliters: 250 });
    expect((await ops.commit(requestId, true)).items[0].state).toBe("verified");
    expect((await ops.remove(requestId, true)).items[0].state).toBe("deleted");
  });
});

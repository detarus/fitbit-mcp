import { createHash } from "node:crypto";
import { z } from "zod";
import { AppError, publicError } from "./errors.js";
import { Store } from "./storage.js";
import { type HealthApi, type Json, validateName } from "./api.js";
import { mealSchema, waterSchema, nutritionBodies, offsetSeconds } from "./schema.js";

type Item = { body: Json; state: "pending" | "sending" | "created" | "verified" | "unknown" | "deleting" | "deleted"; name?: string; error?: unknown };
type Operation = { id: string; kind: "nutrition-log" | "hydration-log"; account: string; fingerprint: string; createdAt: string; preview: unknown; items: Item[]; cancelled?: boolean };
const idSchema = z.string().uuid();
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export class Operations {
  constructor(public store: Store, public api: HealthApi, private canWrite: () => Promise<boolean>) {}
  file(id: string) { return (this.api.demo ? "demo-" : "live-") + idSchema.parse(id) + ".json"; }
  async account() { return digest(await this.api.accountKey()); }
  async load(id: string) {
    const op = await this.store.read<Operation>(this.file(id));
    if (!op) throw new AppError("OPERATION_NOT_FOUND", "No preview with this ID in the current mode.");
    if (op.account !== await this.account()) throw new AppError("ACCOUNT_MISMATCH", "This preview belongs to a different account or OAuth client.");
    return op;
  }
  result(op: Operation) {
    return {
      demo: this.api.demo, operationId: op.id, kind: op.kind, preview: op.preview, cancelled: !!op.cancelled,
      items: op.items.map(({ state, name, error }) => ({ state, name, error })),
      note: op.items.some(i => ["sending", "unknown", "deleting"].includes(i.state)) ? "Uncertain state. Do not submit a new preview for the same meal. Inspect Google Health and reconcile." : undefined,
    };
  }
  async preview(kind: "meal" | "water", input: unknown) {
    const parsed = kind === "meal" ? mealSchema.parse(input) : waterSchema.parse(input);
    const id = parsed.requestId;
    return this.store.locked("session", () => this.store.locked(this.file(id), async () => {
      const account = await this.account(), fingerprint = digest(parsed);
      const existing = await this.store.read<Operation>(this.file(id));
      if (existing) {
        if (existing.account !== account || existing.fingerprint !== fingerprint) throw new AppError("REQUEST_ID_CONFLICT", "This request ID already exists with different contents or account. Inspect it before creating a new request.");
        return this.result(existing);
      }
      const bodies = kind === "meal" ? nutritionBodies(mealSchema.parse(parsed)) : (() => {
        const w = waterSchema.parse(parsed);
        return [{ hydrationLog: { interval: { startTime: w.at, endTime: new Date(Date.parse(w.at) + 1000).toISOString(), startUtcOffset: offsetSeconds(w.at) + "s", endUtcOffset: offsetSeconds(w.at) + "s" }, amountConsumed: { milliliters: w.milliliters } } }];
      })();
      const op: Operation = { id, kind: kind === "meal" ? "nutrition-log" : "hydration-log", account, fingerprint, createdAt: new Date().toISOString(), preview: parsed, items: bodies.map(body => ({ body, state: "pending" })) };
      await this.store.write(this.file(id), op);
      return this.result(op);
    }));
  }
  async commit(id: string, confirm: boolean) {
    if (!confirm) throw new AppError("CONFIRM_REQUIRED", "Show the preview and get explicit intent to save before committing.");
    if (!await this.canWrite()) throw new AppError("WRITE_DISABLED", "Nutrition writes are disabled. Run setup with --nutrition-write and then auth.");
    return this.store.locked("session", () => this.store.locked(this.file(id), async () => {
      const op = await this.load(id);
      if (op.cancelled) throw new AppError("CANCELLED", "This preview was cancelled or its records were removed. Create a new request ID for a new meal.");
      for (const item of op.items) {
        if (["sending", "unknown", "deleting"].includes(item.state)) break;
        if (item.state === "deleted" || item.state === "verified") continue;
        if (item.state === "pending") {
          if (Date.now() - Date.parse(op.createdAt) > 86400000) throw new AppError("PREVIEW_EXPIRED", "This preview is older than 24 hours. Cancel it and review a new preview.");
          // Persist before the network call; a process crash must not lead to a blind resubmission.
          item.state = "sending"; await this.store.write(this.file(id), op);
          try {
            const response = await this.api.create(op.kind, item.body);
            if (response.error || response.done === false) throw new AppError("WRITE_UNCERTAIN", "Google has not confirmed completion. Inspect the diary before retrying.");
            const name = response.response?.name || response.name;
            item.name = validateName(name || "", op.kind); item.state = "created";
          } catch (error) {
            item.state = "unknown"; item.error = publicError(error);
          }
          await this.store.write(this.file(id), op);
          if (item.state === "unknown") break;
        }
        if (item.name && item.state === "created") {
          try {
            const value = await this.api.get(item.name);
            const key = op.kind === "nutrition-log" ? "nutritionLog" : "hydrationLog";
            const expected = item.body[key], actual = value[key];
            if (!actual) throw new AppError("VERIFY", "Created resource did not contain the expected record.");
            if (key === "nutritionLog" && (actual.foodDisplayName !== expected.foodDisplayName || actual.energy?.kcal !== expected.energy?.kcal || actual.totalFat?.grams !== expected.totalFat?.grams || actual.totalCarbohydrate?.grams !== expected.totalCarbohydrate?.grams || actual.nutrients?.find((n: Json) => n.nutrient === "PROTEIN")?.quantity?.grams !== expected.nutrients[0].quantity.grams)) throw new AppError("VERIFY", "Saved nutrition differs from the reviewed preview. Inspect the diary.");
            if (key === "hydrationLog" && actual.amountConsumed?.milliliters !== expected.amountConsumed.milliliters) throw new AppError("VERIFY", "Saved water amount differs from the preview.");
            item.state = "verified"; delete item.error;
          } catch (error) { item.error = publicError(error); }
          await this.store.write(this.file(id), op);
          if (item.state !== "verified") break;
        }
      }
      return this.result(op);
    }));
  }
  async status(id: string) { return this.result(await this.load(id)); }
  async cancel(id: string) {
    return this.store.locked("session", () => this.store.locked(this.file(id), async () => {
      const op = await this.load(id);
      if (op.items.some(i => i.state !== "pending")) throw new AppError("NOT_A_DRAFT", "Only an untouched draft can be cancelled. Use remove for known created records.");
      op.cancelled = true; await this.store.write(this.file(id), op); return this.result(op);
    }));
  }
  async remove(id: string, confirm: boolean) {
    if (!confirm) throw new AppError("CONFIRM_REQUIRED", "Explicit intent to remove this operation's records is required.");
    if (!await this.canWrite()) throw new AppError("WRITE_DISABLED", "Nutrition writes are disabled.");
    return this.store.locked("session", () => this.store.locked(this.file(id), async () => {
      const op = await this.load(id);
      for (const item of op.items) {
        if (item.state === "pending" || item.state === "deleted") continue;
        if (!item.name || !["created", "verified"].includes(item.state)) throw new AppError("RECONCILE_REQUIRED", "An item has an uncertain outcome. Inspect the diary; automatic deletion is blocked.");
        item.state = "deleting"; await this.store.write(this.file(id), op);
        try {
          await this.api.remove(op.kind, item.name);
          // A successful response is checked against a resource read.
          try { await this.api.get(item.name); throw new AppError("VERIFY_DELETE", "Resource still readable after deletion."); }
          catch (error) { if (!(error instanceof AppError && error.status === 404)) throw error; }
          item.state = "deleted"; delete item.error;
        } catch (error) {
          item.error = publicError(error); await this.store.write(this.file(id), op);
          throw new AppError("DELETE_UNCERTAIN", "Deletion could not be verified. Inspect Google Health before further changes.");
        }
        await this.store.write(this.file(id), op);
      }
      op.cancelled = true; await this.store.write(this.file(id), op); return this.result(op);
    }));
  }
}

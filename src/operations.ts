import { createHash } from "node:crypto";
import { z } from "zod";
import { AppError, publicError } from "./errors.js";
import { Store } from "./storage.js";
import { type HealthApi, type Json, validateName } from "./api.js";
import { mealSchema, waterSchema, nutritionBodies, offsetSeconds } from "./schema.js";

type Item = { body: Json; state: "pending" | "sending" | "created" | "verified" | "unknown" | "deleting" | "deleted"; expectedName?: string; name?: string; error?: unknown };
type Operation = { id: string; kind: "nutrition-log" | "hydration-log"; account: string; fingerprint: string; createdAt: string; preview: unknown; items: Item[]; cancelled?: boolean; correctionOf?: string; replacedBy?: string };
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
  persist(op: Operation) { return this.store.write(this.file(op.id), op); }
  result(op: Operation) {
    return {
      demo: this.api.demo, operationId: op.id, kind: op.kind, preview: op.preview, cancelled: !!op.cancelled,
      correctionOf: op.correctionOf, replacedBy: op.replacedBy,
      items: op.items.map(({ state, name, error }) => ({ state, name, error })),
      note: op.items.some(i => ["sending", "unknown", "deleting"].includes(i.state)) ? "Uncertain state. Run fitbit_reconcile; do not submit a new draft for the same occurrence." : op.correctionOf ? "Correction is not atomic: old records are removed before replacement records are saved. Inspect both operation IDs." : undefined,
    };
  }
  async preview(kind: "meal" | "water", input: unknown, correctionOf?: string) {
    const parsed = kind === "meal" ? mealSchema.parse(input) : waterSchema.parse(input);
    const id = parsed.requestId;
    if (correctionOf) { idSchema.parse(correctionOf); if (id === correctionOf) throw new AppError("REQUEST_ID_CONFLICT", "A correction needs a new request ID."); }
    return this.store.locked("session", () => this.store.locked(this.file(id), async () => {
      const account = await this.account(), fingerprint = digest(parsed);
      const existing = await this.store.read<Operation>(this.file(id));
      if (existing) {
        if (existing.account !== account || existing.fingerprint !== fingerprint || existing.correctionOf !== correctionOf) throw new AppError("REQUEST_ID_CONFLICT", "This request ID already exists with different contents, correction or account.");
        return this.result(existing);
      }
      if (correctionOf) {
        const old = await this.load(correctionOf);
        if (old.kind !== (kind === "meal" ? "nutrition-log" : "hydration-log") || old.cancelled || old.replacedBy || old.items.some(i => i.state !== "verified")) throw new AppError("CORRECTION_BLOCKED", "Correct only a verified, active operation of the same kind; reconcile uncertain records first.");
      }
      const bodies = kind === "meal" ? nutritionBodies(mealSchema.parse(parsed)) : (() => {
        const w = waterSchema.parse(parsed);
        return [{ hydrationLog: { interval: { startTime: w.at, endTime: new Date(Date.parse(w.at) + 1000).toISOString(), startUtcOffset: offsetSeconds(w.at) + "s", endUtcOffset: offsetSeconds(w.at) + "s" }, amountConsumed: { milliliters: w.milliliters } } }];
      })();
      const op: Operation = { id, kind: kind === "meal" ? "nutrition-log" : "hydration-log", account, fingerprint, createdAt: new Date().toISOString(), preview: parsed, items: bodies.map(body => ({ body, state: "pending" })), ...(correctionOf ? { correctionOf } : {}) };
      await this.persist(op);
      return this.result(op);
    }));
  }
  verify(op: Operation, item: Item, value: Json) {
    const key = op.kind === "nutrition-log" ? "nutritionLog" : "hydrationLog";
    const expected = item.body[key], actual = value[key];
    if (!actual || Date.parse(actual.interval?.startTime || "") !== Date.parse(expected.interval.startTime)
      || Date.parse(actual.interval?.endTime || "") !== Date.parse(expected.interval.endTime)) throw new AppError("VERIFY", "Saved resource does not match the reviewed record and time.");
    const scalar = (value: Json | undefined, field: string) => value ? Number(value[field] ?? 0) : undefined;
    if (key === "nutritionLog" && (actual.foodDisplayName !== expected.foodDisplayName || actual.mealType !== expected.mealType || scalar(actual.energy, "kcal") !== expected.energy?.kcal || scalar(actual.totalFat, "grams") !== expected.totalFat?.grams || scalar(actual.totalCarbohydrate, "grams") !== expected.totalCarbohydrate?.grams || scalar(actual.nutrients?.find((n: Json) => n.nutrient === "PROTEIN")?.quantity, "grams") !== expected.nutrients[0].quantity.grams)) throw new AppError("VERIFY", "Saved nutrition differs from the reviewed preview.");
    if (key === "hydrationLog" && scalar(actual.amountConsumed, "milliliters") !== expected.amountConsumed.milliliters) throw new AppError("VERIFY", "Saved water amount differs from the preview.");
  }
  async readBack(op: Operation, item: Item) {
    const name = item.name || item.expectedName;
    if (!name) return; // Older journals cannot infer identity by matching food/time alone.
    const value = await this.api.get(validateName(name, op.kind));
    if (value.name !== name) throw new AppError("VERIFY", "Resource identity differs from the journal.");
    this.verify(op, item, value);
    item.name = name; item.state = "verified"; delete item.error;
  }
  async reconcile(id: string) {
    return this.store.locked("session", () => this.store.locked(this.file(id), async () => {
      const op = await this.load(id);
      for (const item of op.items) {
        if (["sending", "unknown", "created"].includes(item.state)) {
          try { await this.readBack(op, item); }
          catch (error) {
            // A 404 may mean delayed visibility; absence never authorizes a new POST.
            item.error = publicError(error);
          }
        } else if (item.state === "deleting" && item.name) {
          try {
            const value = await this.api.get(item.name);
            this.verify(op, item, value); // Still present: a later explicit remove can resume.
            item.state = "verified"; delete item.error;
          } catch (error) {
            if (error instanceof AppError && error.status === 404) { item.state = "deleted"; delete item.error; }
            else item.error = publicError(error);
          }
        }
        await this.persist(op);
      }
      if (op.items.every(i => i.state === "deleted")) { op.cancelled = true; await this.persist(op); }
      return this.result(op);
    }));
  }
  async save(op: Operation) {
    for (const [index, item] of op.items.entries()) {
      if (["sending", "unknown", "deleting"].includes(item.state)) break;
      if (item.state === "deleted" || item.state === "verified") continue;
      if (item.state === "pending") {
        if (Date.now() - Date.parse(op.createdAt) > 86400000) throw new AppError("PREVIEW_EXPIRED", "Preview is older than 24 hours. Inspect existing records before making a new draft.");
        item.expectedName = await this.api.nameFor(op.kind, "fm-" + op.id.toLowerCase() + "-" + index);
        item.state = "sending"; await this.persist(op);
        try {
          const response = await this.api.create(op.kind, { ...item.body, name: item.expectedName });
          if (response.error || response.done === false) throw new AppError("WRITE_UNCERTAIN", "Google has not confirmed completion. Reconcile this operation.");
          const name = validateName(response.response?.name || response.name || "", op.kind);
          if (name !== item.expectedName) throw new AppError("VERIFY", "Provider did not preserve the requested resource ID. Inspect the diary.");
          item.name = name; item.state = "created";
        } catch (error) { item.state = "unknown"; item.error = publicError(error); }
        await this.persist(op);
        if (item.state === "unknown") break;
      }
      if (item.name && item.state === "created") {
        try { await this.readBack(op, item); } catch (error) { item.error = publicError(error); }
        await this.persist(op);
        if (!["verified"].includes(item.state)) break;
      }
    }
  }
  async commit(id: string, confirm: boolean) {
    if (!confirm) throw new AppError("CONFIRM_REQUIRED", "Show the preview and get explicit intent to save before committing.");
    return this.store.locked("session", () => this.store.locked(this.file(id), async () => {
      if (!await this.canWrite()) throw new AppError("WRITE_DISABLED", "Nutrition writes are disabled. Run setup with --nutrition-write and then auth.");
      const op = await this.load(id);
      if (op.cancelled || op.replacedBy) throw new AppError("CANCELLED", "This operation was cancelled, removed or superseded.");
      if (op.correctionOf) {
        const old = await this.load(op.correctionOf);
        if (old.replacedBy && old.replacedBy !== id || old.cancelled && old.replacedBy !== id) throw new AppError("CORRECTION_BLOCKED", "Original operation was removed or has another correction.");
        if (!old.replacedBy) {
          if (Date.now() - Date.parse(op.createdAt) > 86400000) throw new AppError("PREVIEW_EXPIRED", "Review a new correction before deleting originals.");
          if (old.items.some(i => i.state !== "verified")) throw new AppError("CORRECTION_BLOCKED", "Reconcile the original operation first.");
          old.replacedBy = id; await this.persist(old);
        }
        await this.deleteKnown(old);
      }
      await this.save(op);
      return this.result(op);
    }));
  }
  async status(id: string) { return this.result(await this.load(id)); }
  async list() {
    return this.store.locked("session", async () => {
      const account = await this.account(), operations = [];
      for (const name of await this.store.operationFiles(this.api.demo)) {
        const op = await this.store.read<Operation>(name);
        if (op?.account === account) operations.push({ operationId: op.id, kind: op.kind, createdAt: op.createdAt, cancelled: !!op.cancelled, correctionOf: op.correctionOf, replacedBy: op.replacedBy, states: op.items.map(i => i.state) });
      }
      return { demo: this.api.demo, operations: operations.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) };
    });
  }
  async cancel(id: string) {
    return this.store.locked("session", () => this.store.locked(this.file(id), async () => {
      const op = await this.load(id);
      if (op.items.some(i => i.state !== "pending")) throw new AppError("NOT_A_DRAFT", "Only an untouched draft can be cancelled. Use remove for known created records.");
      if (op.correctionOf && (await this.load(op.correctionOf)).replacedBy === id) throw new AppError("CORRECTION_STARTED", "This correction has begun deleting originals; inspect both IDs and finish it.");
      op.cancelled = true; await this.persist(op); return this.result(op);
    }));
  }
  async deleteKnown(op: Operation) {
    for (const item of op.items) {
      if (item.state === "pending" || item.state === "deleted") continue;
      if (!item.name || !["created", "verified"].includes(item.state)) throw new AppError("RECONCILE_REQUIRED", "An item has an uncertain outcome. Run fitbit_reconcile; deletion is blocked.");
      item.state = "deleting"; await this.persist(op);
      try {
        await this.api.remove(op.kind, item.name);
        try { await this.api.get(item.name); throw new AppError("VERIFY_DELETE", "Resource still readable after deletion."); }
        catch (error) { if (!(error instanceof AppError && error.status === 404)) throw error; }
        item.state = "deleted"; delete item.error;
      } catch (error) {
        item.error = publicError(error); await this.persist(op);
        throw new AppError("DELETE_UNCERTAIN", "Deletion could not be verified. Run fitbit_reconcile for this operation.");
      }
      await this.persist(op);
    }
    op.cancelled = true; await this.persist(op);
  }
  async remove(id: string, confirm: boolean) {
    if (!confirm) throw new AppError("CONFIRM_REQUIRED", "Explicit intent to remove this operation's records is required.");
    return this.store.locked("session", () => this.store.locked(this.file(id), async () => {
      if (!await this.canWrite()) throw new AppError("WRITE_DISABLED", "Nutrition writes are disabled.");
      const op = await this.load(id);
      if (op.replacedBy) throw new AppError("CORRECTION_STARTED", "Resume the linked correction instead.");
      await this.deleteKnown(op); return this.result(op);
    }));
  }
}

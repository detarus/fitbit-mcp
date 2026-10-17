import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { Auth } from "./auth.js";
import { type HealthApi, type Json, scopesFor } from "./api.js";
import { Operations } from "./operations.js";
import { publicError } from "./errors.js";
import { rangeSchema, typeSchema, types, mealSchema, waterSchema } from "./schema.js";

export function createMcp(api: HealthApi, ops: Operations, auth?: Auth) {
  const server = new McpServer({ name: "fitbit-mcp", version: "0.1.0-alpha.1" });
  const read = { readOnlyHint: true, destructiveHint: false, openWorldHint: !api.demo };
  const mutate = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: !api.demo };
  const result = async (fn: () => Promise<unknown>) => {
    try { return { content: [{ type: "text" as const, text: JSON.stringify(await fn(), null, 2) }] }; }
    catch (e) {
      const error = e instanceof z.ZodError ? { code: "INVALID_INPUT", message: e.issues.map(i => i.path.join(".") + ": " + i.message).join("; ") } : publicError(e);
      return { isError: true, content: [{ type: "text" as const, text: JSON.stringify(error) }] };
    }
  };
  server.registerTool("fitbit_status", {
    description: "Local connection metadata and implemented types. Declared support is not proof of data availability on this device. Does not return credentials.",
    inputSchema: {}, annotations: { ...read, openWorldHint: false },
  }, () => result(async () => {
    const record = await auth?.record();
    const config = auth ? await auth.config().catch(() => undefined) : undefined;
    return { demo: api.demo, configured: api.demo || !!config, connected: api.demo || !!record, nutritionWrites: api.demo || !!config?.nutritionWrite, grantedScopes: record?.scopes || [], supportedTypes: types.map(type => ({ type, readScope: scopesFor[type] })), liveAccountVerified: false };
  }));
  server.registerTool("fitbit_devices", { description: "Read paired device metadata.", inputSchema: {}, annotations: read }, () => result(() => api.info()));
  server.registerTool("fitbit_request_id", { description: "Generate a UUID for one new meal/water draft. Reuse the same ID on retries; use a new ID for a new occurrence.", inputSchema: {}, annotations: { ...read, openWorldHint: false } }, () => result(async () => ({ requestId: randomUUID() })));
  server.registerTool("fitbit_read", {
    description: "Read 1–14 civil calendar days, endDate exclusive. Sleep is grouped by wake date. Raw samples may overlap: do not sum them as daily totals. At most 500 points; incomplete results are explicit.",
    inputSchema: { type: typeSchema, ...rangeSchema.shape }, annotations: read,
  }, args => result(async () => {
    const range = rangeSchema.parse(args);
    return api.points(args.type, range.startDate, range.endDate);
  }));
  server.registerTool("fitbit_activity", {
    description: "Daily server-reconciled wearable activity for 1–14 civil days (end exclusive). Returns raw rollup fields; missing values are not zero. A failed domain is explicit.",
    inputSchema: rangeSchema.shape, annotations: read,
  }, args => result(async () => {
    const range = rangeSchema.parse(args), domains: Json = {};
    for (const type of ["steps", "distance", "total-calories", "active-zone-minutes"] as const) {
      try { domains[type] = await api.daily(type, range.startDate, range.endDate); }
      catch (e) { domains[type] = { error: publicError(e) }; }
    }
    return { demo: api.demo, ...range, fetchedAt: new Date().toISOString(), timeBasis: "Google Health civil calendar dates with provider offsets; not UTC midnight buckets", dataSourceFamily: "google-wearables", domains };
  }));
  server.registerTool("fitbit_preview_meal", {
    description: "Create a local meal draft ONLY. Values apply to the whole dish portion, not per 100g. Review assumptions, portions, date/offset and all K/P/F/C values before saving. Photo estimates are approximate.",
    inputSchema: mealSchema.shape, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, args => result(() => ops.preview("meal", args)));
  server.registerTool("fitbit_preview_water", {
    description: "Create a local water draft ONLY. Review volume and date/time with offset before saving.",
    inputSchema: waterSchema.shape, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, args => result(() => ops.preview("water", args)));
  const id = { operationId: z.string().uuid() };
  server.registerTool("fitbit_operation", { description: "Inspect the persisted state of a meal/water operation. Never silently resubmit uncertain writes.", inputSchema: id, annotations: { ...read, openWorldHint: false } }, args => result(() => ops.status(args.operationId)));
  server.registerTool("fitbit_commit", {
    description: "Save an existing reviewed preview after explicit user intent. Reusing its operation ID never blindly replays an uncertain item. Return per-item states; only verified means read-back succeeded.",
    inputSchema: { ...id, confirm: z.literal(true) }, annotations: mutate,
  }, args => result(() => ops.commit(args.operationId, args.confirm)));
  server.registerTool("fitbit_cancel_draft", { description: "Cancel an untouched local preview; does not delete Google records.", inputSchema: id, annotations: { ...mutate, openWorldHint: false } }, args => result(() => ops.cancel(args.operationId)));
  server.registerTool("fitbit_remove", {
    description: "Remove only the known Google records created by this operation, after explicit user intent. Blocks uncertain records; verifies deletion. To correct manual-food macros, remove old records then review and save a new preview; this is not atomic.",
    inputSchema: { ...id, confirm: z.literal(true) }, annotations: mutate,
  }, args => result(() => ops.remove(args.operationId, args.confirm)));
  return server;
}

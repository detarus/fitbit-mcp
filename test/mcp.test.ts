import { it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
it("connects via real stdio and completes a synthetic meal roundtrip", async () => {
  const client = new Client({ name: "fitbit-mcp-ci", version: "1" });
  const transport = new StdioClientTransport({ command: process.execPath, args: [resolve("dist/cli.js"), "serve", "--demo"], stderr: "pipe" });
  await client.connect(transport);
  try {
    const list = await client.listTools();
    expect(list.tools.map(t => t.name)).toContain("fitbit_preview_meal");
    const invoke = async (name: string, args: Record<string, unknown> = {}) => {
      const r = await client.callTool({ name, arguments: args });
      expect(r.isError).not.toBe(true);
      return JSON.parse((r.content as { type: string; text: string }[])[0].text);
    };
    expect((await invoke("fitbit_status")).demo).toBe(true);
    const summary = await invoke("fitbit_summary", { startDate: "2026-10-01", endDate: "2026-10-03" });
    expect(summary.summary.steps.total).toBe(13250);
    expect(summary.summary.sleepMinutes.observedDays).toBe(2);
    const comparison = await invoke("fitbit_compare", { startDate: "2026-10-08", endDate: "2026-10-10", domains: ["activity"] });
    expect(comparison.comparisons.steps.pairedDays).toBe(2);
    expect((await invoke("fitbit_recovery", { date: "2026-10-17" })).status).toBe("calculated");
    const requestId = randomUUID();
    await invoke("fitbit_preview_meal", { requestId, at: "2026-10-17T13:00:00+03:00", mealType: "LUNCH", dishes: [{ name: "Synthetic rice", grams: 100, kcal: 130, protein: 2.7, fat: 0.3, carbs: 28, source: "user-provided" }] });
    expect((await invoke("fitbit_commit", { operationId: requestId, confirm: true })).items[0].state).toBe("verified");
    expect((await invoke("fitbit_remove", { operationId: requestId, confirm: true })).items[0].state).toBe("deleted");
  } finally { await client.close(); }
}, 20000);

it("exposes shared workflows and completes cancel, repeated meal, water correction and discovery scenarios", async () => {
  const client = new Client({ name: "fitbit-scenarios", version: "1" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [resolve("dist/cli.js"), "serve", "--demo"], stderr: "pipe" }));
  const call = async (name: string, args: Record<string, unknown> = {}, error = false) => {
    const r = await client.callTool({ name, arguments: args });
    expect(!!r.isError).toBe(error);
    return JSON.parse((r.content as { text: string }[])[0].text);
  };
  try {
    expect((await client.listPrompts()).prompts.map(p => p.name)).toEqual(expect.arrayContaining(["fitbit_setup", "fitbit_review", "fitbit_nutrition"]));
    const prompt = await client.getPrompt({ name: "fitbit_nutrition" });
    expect(JSON.stringify(prompt)).toContain("fitbit_preview_correction");
    const draft = randomUUID();
    await call("fitbit_preview_water", { requestId: draft, at: "2026-10-16T12:00:00+03:00", milliliters: 200 });
    expect((await call("fitbit_cancel_draft", { operationId: draft })).cancelled).toBe(true);
    expect((await call("fitbit_commit", { operationId: draft, confirm: true }, true)).code).toBe("CANCELLED");
    const first = randomUUID(), second = randomUUID();
    for (const [requestId, at] of [[first, "2026-10-16T12:00:00Z"], [second, "2026-10-17T12:00:00Z"]]) {
      await call("fitbit_preview_water", { requestId, at, milliliters: 250 });
      expect((await call("fitbit_commit", { operationId: requestId, confirm: true })).items[0].state).toBe("verified");
    }
    const correction = randomUUID();
    await call("fitbit_preview_water_correction", { requestId: correction, originalOperationId: first, at: "2026-10-16T12:00:00Z", milliliters: 300 });
    expect((await call("fitbit_commit", { operationId: correction, confirm: true })).items[0].state).toBe("verified");
    expect((await call("fitbit_operation", { operationId: first })).items[0].state).toBe("deleted");
    expect((await call("fitbit_reconcile", { operationId: second })).items[0].state).toBe("verified");
    expect((await call("fitbit_operations")).operations).toHaveLength(4);
    expect((await call("fitbit_read", { type: "exercise", startDate: "2026-10-01", endDate: "2026-10-02" })).dataPoints).toEqual([]);
  } finally { await client.close(); }
}, 30000);
